/**
 * credit-meter.ts — CreditMeter (PRD §13), runtime-agnostic.
 *
 * A Durable Object is Cloudflare's single-threaded, strongly-consistent compute
 * primitive: exactly one instance per user, processing one operation at a time.
 * That property is what makes credit accounting safe — no two generations can
 * race to overspend or double-debit. The `CreditMeter` class below reproduces
 * it with a per-user async mutex, idempotency on generationId, and plan-based
 * concurrency slots (Free 1 / Pro 3).
 *
 * The class is used **directly** on both runtimes: in-process on Node, and
 * *inside* the CreditMeterDO Durable Object on Cloudflare (which provides the
 * real single-instance/single-thread guarantee). The live balance lives in the
 * meter; the durable ledger lives in D1 — settle/grant write both (§13.1).
 */

import { PLAN_LIMITS } from "@aiab/shared";
import type { CreditReason, Plan } from "@aiab/shared";
import { transactions, users } from "../db/repo.js";
import { getBackend } from "./runtime.js";
import { log } from "../util/logger.js";

export type ReserveResult =
  | { ok: true; reserved: number }
  | { ok: false; status: 402 | 409; code: string; message: string };

/**
 * The cross-runtime surface the generation/billing code depends on. Satisfied
 * both by the `CreditMeter` class (Node) and by the Durable Object stub (CF).
 */
export interface CreditMeterHandle {
  reserve(generationId: string, est: number): Promise<ReserveResult>;
  settle(
    generationId: string,
    actual: number,
    refVersionId?: string | null
  ): Promise<{ debited: number; balance: number }>;
  refund(generationId: string): Promise<{ refunded: number }>;
  grant(amount: number, reason: CreditReason): Promise<{ balance: number }>;
  setPlan(plan: Plan): Promise<void>;
}

export class CreditMeter implements CreditMeterHandle {
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
  settle(
    generationId: string,
    actual: number,
    refVersionId?: string | null
  ): Promise<{ debited: number; balance: number }> {
    return this.serialize(async () => {
      if (this.applied.get(generationId) === "settled") {
        return { debited: 0, balance: this.balance };
      }
      this.reserved.delete(generationId);
      this.active.delete(generationId);
      this.applied.set(generationId, "settled");
      const debited = Math.max(0, Math.round(actual));
      this.balance = Math.max(0, this.balance - debited);
      await users.setBalance(this.clerkUserId, this.balance);
      if (debited > 0) {
        await transactions.add(this.clerkUserId, {
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
   * Abort path: release the reservation and slot without debiting. The balance
   * was never reduced at reserve time, so no ledger write is needed. Idempotent.
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
    return this.serialize(async () => {
      this.balance += Math.max(0, Math.round(amount));
      await users.setBalance(this.clerkUserId, this.balance);
      await transactions.add(this.clerkUserId, { userId: this.userId, delta: amount, reason });
      log.info("credit.grant", { userId: this.userId, amount, reason, balance: this.balance });
      return { balance: this.balance };
    });
  }
}

/** Construct a freshly-hydrated meter from the user's durable row in D1. */
export async function hydrateCreditMeter(clerkUserId: string): Promise<CreditMeter> {
  const user = await users.getByClerkId(clerkUserId);
  if (!user) throw new Error(`No user for clerkUserId=${clerkUserId}`);
  return new CreditMeter(clerkUserId, user.id, user.creditsBalance, user.plan);
}

/** Get (or hydrate) the CreditMeter handle for a user, via the active backend. */
export function getCreditMeter(clerkUserId: string): Promise<CreditMeterHandle> {
  return getBackend().creditMeter(clerkUserId);
}
