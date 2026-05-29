/**
 * credit-meter-do.ts — The CreditMeter Durable Object (PRD §13).
 *
 * On Cloudflare this is where the PRD's strong-consistency guarantee comes from:
 * Durable Objects are single-instance, single-threaded, so one instance per user
 * processes credit operations one at a time. We reuse the exact `CreditMeter`
 * class (the same serialization + idempotency the local backend uses) inside
 * the DO; the DO simply provides the real single-threaded execution and a stable
 * home for the live balance, while the durable ledger stays in D1.
 *
 * Each DO instance is keyed by `idFromName(clerkUserId)`, so it only ever serves
 * one user — hence a single cached meter is correct.
 */

import { DurableObject } from "cloudflare:workers";
import type { CreditReason, Plan } from "@aiab/shared";
import type { Env } from "./bindings.js";
import { setBackend } from "../runtime.js";
import { createCfBackend } from "./backend.js";
import { CreditMeter, hydrateCreditMeter, type ReserveResult } from "../credit-meter.js";

export class CreditMeterDO extends DurableObject<Env> {
  private meter: CreditMeter | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // repo (D1) calls made inside this DO isolate must resolve to the CF backend.
    setBackend(createCfBackend(env));
  }

  private async meterFor(clerkUserId: string): Promise<CreditMeter> {
    if (!this.meter) this.meter = await hydrateCreditMeter(clerkUserId);
    return this.meter;
  }

  async reserve(clerkUserId: string, generationId: string, est: number): Promise<ReserveResult> {
    return (await this.meterFor(clerkUserId)).reserve(generationId, est);
  }

  async settle(
    clerkUserId: string,
    generationId: string,
    actual: number,
    refVersionId?: string | null
  ): Promise<{ debited: number; balance: number }> {
    return (await this.meterFor(clerkUserId)).settle(generationId, actual, refVersionId);
  }

  async refund(clerkUserId: string, generationId: string): Promise<{ refunded: number }> {
    return (await this.meterFor(clerkUserId)).refund(generationId);
  }

  async grant(clerkUserId: string, amount: number, reason: CreditReason): Promise<{ balance: number }> {
    return (await this.meterFor(clerkUserId)).grant(amount, reason);
  }

  async setPlan(clerkUserId: string, plan: Plan): Promise<void> {
    await (await this.meterFor(clerkUserId)).setPlan(plan);
  }
}

// Ambient type for DurableObjectState (provided by @cloudflare/workers-types).
type DurableObjectState = import("@cloudflare/workers-types").DurableObjectState;
