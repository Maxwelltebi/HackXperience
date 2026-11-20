import type { Sql } from './client';
import { processOutbox, recoverStuckOutbox, type OutboxDeps, type OutboxResult } from './outbox';

/** Advisory lock key for the tick: "HX" plus 1. Any fixed bigint works; it must never change. */
export const TICK_LOCK_KEY = 7_288_001;

export type TickResult =
  | { skipped: true }
  | { skipped: false; recovered: number; outbox: OutboxResult | 'not_configured' };

/**
 * One run of POST /api/internal/tick (every minute from pg_cron).
 *
 * The database-only steps run in one transaction holding pg_try_advisory_xact_lock, so two
 * ticks never run them at once; a tick that can't get the lock does nothing. The lock is the
 * transaction-scoped kind because the production pooler runs in transaction mode, where a
 * session lock could stay stuck on a pooled connection.
 * Network steps (sending) run after that commit, outside any transaction (Agent rule 9);
 * they are safe to overlap because claiming uses FOR UPDATE SKIP LOCKED.
 * Later phases add steps: deadline locks and reminders (Phase 4), push receipts (Phase 6).
 *
 * With `deps` null (email not configured), emails wait in the outbox instead of failing.
 */
export async function runTick(sql: Sql, deps: OutboxDeps | null): Promise<TickResult> {
  const recovered = await sql.begin(async (tx) => {
    const [row] = await tx<
      [{ locked: boolean }]
    >`select pg_try_advisory_xact_lock(${TICK_LOCK_KEY}::bigint) as locked`;
    if (!row.locked) return null;
    return recoverStuckOutbox(tx);
  });
  if (recovered === null) return { skipped: true };

  const outbox = deps ? await processOutbox(sql, deps) : 'not_configured';
  return { skipped: false, recovered, outbox };
}
