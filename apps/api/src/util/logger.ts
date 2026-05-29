/**
 * logger.ts — Structured logging (PRD Section 17.2).
 *
 * Emits one JSON line per event with the fields the PRD calls out (request id,
 * user id, model, latency, tokens, credits, d1_shard, cache_status). In a real
 * deployment these lines would be shipped to a log pipeline; locally they go to
 * stdout where they're still grep-able and parseable.
 */

type LogFields = Record<string, unknown>;

function emit(level: "info" | "warn" | "error", msg: string, fields: LogFields = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields });
  // eslint-disable-next-line no-console
  console[level === "error" ? "error" : "log"](line);
}

export const log = {
  info: (msg: string, fields?: LogFields) => emit("info", msg, fields),
  warn: (msg: string, fields?: LogFields) => emit("warn", msg, fields),
  error: (msg: string, fields?: LogFields) => emit("error", msg, fields),
};

/**
 * Lightweight in-memory analytics sink (PRD Section 17.1 product events).
 * Tracks counts so /api/metrics can expose cache-hit / dedup-hit rates, etc.
 */
class Analytics {
  private counts = new Map<string, number>();
  track(event: string, fields?: LogFields) {
    this.counts.set(event, (this.counts.get(event) ?? 0) + 1);
    emit("info", `event:${event}`, fields);
  }
  snapshot(): Record<string, number> {
    return Object.fromEntries(this.counts);
  }
}

export const analytics = new Analytics();
