/**
 * credit-meter.ts — Local model of the CreditMeter Durable Object (PRD §13).
 *
 * A Durable Object is Cloudflare's single-threaded, strongly-consistent compute
 * primitive: exactly one instance per user, processing one operation at a time.
 * That property is what makes credit accounting safe — no two generations can
 * race to overspend or double-debit. We reproduce it here with:
 *
 *   • One CreditMeter instance per user (keyed by Clerk id), created lazily.
 *   • A per-user async mutex so reserve/settle/refund run serialized.
 *   • Idempotency keyed on generationId (retries/duplicate webhooks are safe).
 *   • Concurrency slots enforced from the plan (Free 1 / Pro 3).
 *
 * The live balance lives here; the durable ledger lives in D1. On settle/refill
 * we write both, keeping the DO and the ledger consistent (PRD §13.1).
 */

import { PLAN_LIMITS } from "@aiab/shared";
import type { CreditReason, Plan } from "@aiab/shared";
import { transactions, users } from "../db/repo.js";
import { log } from "../util/logger.js";

export type ReserveResult =
  | { ok: true; reserved: number }
  | { ok: false; status: 402 | 409; code: string; message: string };

class CreditMeter {
  private balance: number;
  private plan: Plan;
  private reserved = new Map<string, number>();
  private active = new Set<string>();
  private applied = new Map<string, "settled" | "refunded">();
  /** Serializes all operations, mimicking the DO's single-threaded model. */
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly clerkUserId: string,
    private readonly userId: string,
    balance: number,
    plan: Plan
  ) {
    this.balance = balance;
    this.plan = plan;
  }

  /** Queue `fn` so it runs after all previously-queued operations finish. */
  private serialize<T>(fn: () => T | Promise<T>): Promise<T> {
    const run = this.tail.then(fn, fn);
    // Keep the chain alive even if an op throws.
    this.tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  getBalance(): number {
    return this.balance;
  }
  getPlan(): Plan {
    return this.plan;
  }
  setPlan(plan: Plan): Promise<void> {
    return this.serialize(() => {
      this.plan = plan;
    });
  }
  activeCount(): number {
    return this.active.size;
  }

  /** Sum of credits currently held by in-flight reservations. */
  private reservedTotal(): number {
    let sum = 0;
    for (const v of this.reserved.values()) sum += v;
    return sum;
  }

  /**
   * Atomically check balance + claim a concurrency slot, holding `est` credits.
   * Returns 402 if insufficient credits, 409 if the concurrency cap is reached.
   * Idempotent on generationId.
   */
  reserve(generationId: string, est: number): Promise<ReserveResult> {
    return this.serialize<ReserveResult>(() => {
      if (this.applied.has(generationId) || this.reserved.has(generationId)) {
        return { ok: true, reserved: this.reserved.get(generationId) ?? est };
      }
      const limit = PLAN_LIMITS[this.plan].concurrency;
      if (this.active.size >= limit) {
        return {
          ok: false,
          status: 409,
          code: "concurrency_limit",
          message: `Concurrency limit reached (${limit} for ${this.plan}). Wait for a running generation to finish or upgrade.`,
        };
      }
      const available = this.balance - this.reservedTotal();
      if (est > available) {
        return {
          ok: false,
          status: 402,
          code: "insufficient_credits",
          message: `Not enough credits. Need ~${est}, have ${available}. Upgrade to Pro for more.`,
        };
      }
      this.reserved.set(generationId, est);
      this.active.add(generationId);
      log.info("credit.reserve", { userId: this.userId, generationId, est, balance: this.balance });
      return { ok: true, reserved: est };
    });
  }

  /**
   * Finalize a generation: debit the actual cost, release the slot, and append
   * a row to the durable ledger in the user's D1 shard. Idempotent.
   */
  settle(generationId: string, actual: number, refVersionId?: string | null): Promise<{ debited: number; balance: number }> {
    return this.serialize(() => {
      if (this.applied.get(generationId) === "settled") {
        return { debited: 0, balance: this.balance };
      }
      this.reserved.delete(generationId);
      this.active.delete(generationId);
      this.applied.set(generationId, "settled");
      const debited = Math.max(0, Math.round(actual));
      this.balance = Math.max(0, this.balance - debited);
      // Persist live balance + durable ledger row.
      users.setBalance(this.clerkUserId, this.balance);
      if (debited > 0) {
        transactions.add(this.clerkUserId, {
          userId: this.userId,
          delta: -debited,
          reason: "generation",
          refVersionId: refVersionId ?? null,
        });
      }
      log.info("credit.settle", { userId: this.userId, generationId, debited, balance: this.balance });
      return { debited, balance: this.balance };
    });
  }

  /**
   * Abort path: release the reservation and slot without debiting. Returns the
   * number of reserved credits that were freed (reported to the client). The
   * balance was never reduced at reserve time, so no ledger write is needed.
   * Idempotent.
   */
  refund(generationId: string): Promise<{ refunded: number }> {
    return this.serialize(() => {
      if (this.applied.has(generationId)) return { refunded: 0 };
      const held = this.reserved.get(generationId) ?? 0;
      this.reserved.delete(generationId);
      this.active.delete(generationId);
      this.applied.set(generationId, "refunded");
      log.info("credit.refund", { userId: this.userId, generationId, refunded: held });
      return { refunded: held };
    });
  }

  /** Grant credits (signup grant, monthly refill, purchase). Writes ledger. */
  grant(amount: number, reason: CreditReason): Promise<{ balance: number }> {
    return this.serialize(() => {
      this.balance += Math.max(0, Math.round(amount));
      users.setBalance(this.clerkUserId, this.balance);
      transactions.add(this.clerkUserId, { userId: this.userId, delta: amount, reason });
      log.info("credit.grant", { userId: this.userId, amount, reason, balance: this.balance });
      return { balance: this.balance };
    });
  }
}

// ---- Registry: one meter per user, created lazily from D1 ----------------

const meters = new Map<string, CreditMeter>();

/** Get (or hydrate) the CreditMeter for a user. Throws if the user is unknown. */
export function getCreditMeter(clerkUserId: string): CreditMeter {
  let meter = meters.get(clerkUserId);
  if (!meter) {
    const user = users.getByClerkId(clerkUserId);
    if (!user) throw new Error(`No user for clerkUserId=${clerkUserId}`);
    meter = new CreditMeter(clerkUserId, user.id, user.creditsBalance, user.plan);
    meters.set(clerkUserId, meter);
  }
  return meter;
}

/** Drop a cached meter (e.g. after plan change via webhook) so it re-hydrates. */
export function resetCreditMeter(clerkUserId: string): void {
  meters.delete(clerkUserId);
}

export type { CreditMeter };
