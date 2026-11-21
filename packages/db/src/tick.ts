import type { Sql } from './client';
import { processOutbox, recoverStuckOutbox, type OutboxDeps, type OutboxResult } from './outbox';
import { checkPushReceipts, processPushOutbox, type PushDeps, type PushResult } from './push';
import { enqueueDeadlineReminders } from './reminders';
import {
  capturePendingHashes,
  lockDueDeadlines,
  type CommitFetcher,
  type DeadlineLockResult,
  type HashResult,
} from './submissions';

/** Advisory lock key for the tick: "HX" plus 1. Any fixed bigint works; it must never change. */
export const TICK_LOCK_KEY = 7_288_001;

export interface TickDeps {
  /** Sends email. Null when email isn't configured: emails wait in the outbox. */
  outbox: OutboxDeps | null;
  /** Fetches commit hashes from GitHub. */
  fetchCommit: CommitFetcher;
  /** Sends push notifications through Expo. Null: pushes wait in the outbox. */
  push: PushDeps | null;
}

export type TickResult =
  | { skipped: true }
  | {
      skipped: false;
      recovered: number;
      locked: DeadlineLockResult[];
      reminders: number;
      hashes: HashResult;
      outbox: OutboxResult | 'not_configured';
      push: (PushResult & { receipts_checked: number; tokens_removed: number }) | 'not_configured';
    };

/**
 * One run of POST /api/internal/tick (every minute from pg_cron).
 *
 * The database-only steps (recover stuck emails, lock deadlines, queue reminders) run in one
 * transaction holding pg_try_advisory_xact_lock, so two ticks never run them at once; a tick
 * that can't get the lock does nothing. The lock is the transaction-scoped kind because the
 * production pooler runs in transaction mode, where a session lock could stay stuck on a
 * pooled connection. The deadline lock is also safe on its own: it only touches events whose
 * submissions_locked_at is still null, re-checked under the event row lock.
 *
 * Network steps (commit hashes, then sending) run after that commit, outside any transaction
 * (Agent rule 9). They are safe to overlap: hash updates check the row is still pending, and
 * the outbox claim uses FOR UPDATE SKIP LOCKED.
 * Push notifications and their receipts run after email.
 */
export async function runTick(sql: Sql, deps: TickDeps): Promise<TickResult> {
  const steps = await sql.begin(async (tx) => {
    const [row] = await tx<
      [{ locked: boolean }]
    >`select pg_try_advisory_xact_lock(${TICK_LOCK_KEY}::bigint) as locked`;
    if (!row.locked) return null;
    const recovered = await recoverStuckOutbox(tx);
    const locked = await lockDueDeadlines(tx);
    const reminders = await enqueueDeadlineReminders(tx);
    return { recovered, locked, reminders };
  });
  if (steps === null) return { skipped: true };

  const hashes = await capturePendingHashes(sql, deps.fetchCommit);
  const outbox = deps.outbox ? await processOutbox(sql, deps.outbox) : 'not_configured';
  let push: Extract<TickResult, { skipped: false }>['push'] = 'not_configured';
  if (deps.push) {
    const sent = await processPushOutbox(sql, deps.push);
    const receipts = await checkPushReceipts(sql, deps.push);
    push = { ...sent, receipts_checked: receipts.checked, tokens_removed: receipts.removed };
  }
  return { skipped: false, ...steps, hashes, outbox, push };
}
