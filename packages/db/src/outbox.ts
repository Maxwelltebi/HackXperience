import { renderApplicationDecision, type RenderedEmail } from '@hx/emails';
import type { ISql, Sql } from './client';

/** Retries wait 1, 5, 30, then 120 minutes; the 5th failed attempt marks the row failed. */
export const RETRY_DELAYS_MINUTES = [1, 5, 30, 120] as const;
export const MAX_ATTEMPTS = 5;
/** How long a claimed row stays claimed before another tick may take it back. */
export const CLAIM_MINUTES = 2;
export const CLAIM_LIMIT = 200;

/** Sends one email. Implemented with SES in the web app; faked in tests. */
export type EmailSender = (message: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) => Promise<{ messageId: string }>;

export interface OutboxDeps {
  sendEmail: EmailSender;
  /** Public base URL for links in emails, e.g. https://hack.ciren.network */
  appUrl: string;
}

export interface OutboxRow {
  id: string;
  user_id: string;
  template: string;
  payload: Record<string, unknown>;
  attempts: number;
}

export interface OutboxResult {
  claimed: number;
  sent: number;
  superseded: number;
  suppressed: number;
  retrying: number;
  failed: number;
}

/** Rows stuck in `sending` past their claim (a crashed tick) go back to pending, or to failed. */
export async function recoverStuckOutbox(sql: ISql): Promise<number> {
  const rows = await sql`
    update notification_outbox
    set status = case when attempts >= ${MAX_ATTEMPTS} then 'failed'::notification_status
                      else 'pending'::notification_status end,
        locked_until = null,
        last_error = coalesce(last_error, 'claim expired')
    where status = 'sending' and locked_until < now()
    returning id
  `;
  return rows.length;
}

/**
 * Claims up to `limit` due email rows: one statement marks them `sending` with a
 * CLAIM_MINUTES lock and counts the attempt. SKIP LOCKED means two workers never claim
 * the same row. `userIds` narrows the claim (tests use it to stay inside their own data).
 */
export async function claimOutbox(
  sql: ISql,
  limit = CLAIM_LIMIT,
  userIds?: string[],
): Promise<OutboxRow[]> {
  return sql<OutboxRow[]>`
    update notification_outbox o
    set status = 'sending',
        locked_until = now() + make_interval(mins => ${CLAIM_MINUTES}),
        attempts = o.attempts + 1
    where o.id in (
      select id from notification_outbox
      where status = 'pending' and channel = 'email' and send_after <= now()
        ${userIds ? sql`and user_id = any(${userIds}::uuid[])` : sql``}
      order by send_after
      limit ${limit}
      for update skip locked
    )
    returning o.id, o.user_id, o.template, o.payload, o.attempts
  `;
}

/**
 * Claims due rows and delivers them. Every network call happens after the claim has
 * committed, never inside a transaction (Agent rule 9).
 */
export async function processOutbox(
  sql: Sql,
  deps: OutboxDeps,
  options: { limit?: number; userIds?: string[] } = {},
): Promise<OutboxResult> {
  const rows = await claimOutbox(sql, options.limit ?? CLAIM_LIMIT, options.userIds);
  const result: OutboxResult = {
    claimed: rows.length,
    sent: 0,
    superseded: 0,
    suppressed: 0,
    retrying: 0,
    failed: 0,
  };
  for (const row of rows) {
    const outcome = await deliver(sql, row, deps);
    result[outcome] += 1;
  }
  return result;
}

type Outcome = 'sent' | 'superseded' | 'suppressed' | 'retrying' | 'failed';

async function deliver(sql: Sql, row: OutboxRow, deps: OutboxDeps): Promise<Outcome> {
  let prepared: Prepared;
  try {
    prepared = await prepare(sql, row, deps);
  } catch (error) {
    return markFailed(sql, row, error);
  }
  if (prepared.kind === 'superseded') return finish(sql, row.id, 'superseded');
  if (prepared.kind === 'failed') return finish(sql, row.id, 'failed', prepared.reason);

  const [suppressed] =
    await sql`select 1 from email_suppressions where email = ${prepared.to.toLowerCase()}`;
  if (suppressed) return finish(sql, row.id, 'suppressed');

  try {
    const { messageId } = await deps.sendEmail({ to: prepared.to, ...prepared.email });
    await sql`
      update notification_outbox
      set status = 'sent', sent_at = now(), provider_message_id = ${messageId},
          locked_until = null, last_error = null
      where id = ${row.id} and status = 'sending'
    `;
    return 'sent';
  } catch (error) {
    return markFailed(sql, row, error);
  }
}

type Prepared =
  | { kind: 'send'; to: string; email: RenderedEmail }
  | { kind: 'superseded' }
  | { kind: 'failed'; reason: string };

async function prepare(sql: Sql, row: OutboxRow, deps: OutboxDeps): Promise<Prepared> {
  if (row.template === 'application_decision') {
    const applicationId = String(row.payload.application_id);
    const status = String(row.payload.status);
    const [current] = await sql<
      [{ status: string; email: string; name: string; event_name: string; slug: string }?]
    >`
      select a.status, u.email, u.name, e.name as event_name, e.slug
      from applications a
      join users u on u.id = a.user_id
      join events e on e.id = a.event_id
      where a.id = ${applicationId}
    `;
    // Re-read before sending: a decision changed inside the undo window is superseded.
    if (!current || current.status !== status) return { kind: 'superseded' };
    if (status !== 'accepted' && status !== 'waitlisted' && status !== 'rejected') {
      return { kind: 'failed', reason: `unknown decision status ${status}` };
    }
    return {
      kind: 'send',
      to: current.email,
      email: renderApplicationDecision({
        name: current.name,
        eventName: current.event_name,
        status,
        eventUrl: `${deps.appUrl}/events/${current.slug}`,
      }),
    };
  }
  return { kind: 'failed', reason: `unknown template ${row.template}` };
}

async function finish(
  sql: Sql,
  id: string,
  status: 'superseded' | 'suppressed' | 'failed',
  reason?: string,
): Promise<Outcome> {
  await sql`
    update notification_outbox
    set status = ${status}, locked_until = null, last_error = ${reason ?? null}
    where id = ${id} and status = 'sending'
  `;
  return status;
}

/** A failed attempt: retry after the next delay, or give up after MAX_ATTEMPTS. */
async function markFailed(sql: Sql, row: OutboxRow, error: unknown): Promise<Outcome> {
  const giveUp = row.attempts >= MAX_ATTEMPTS;
  const delay = RETRY_DELAYS_MINUTES[Math.min(row.attempts, RETRY_DELAYS_MINUTES.length) - 1] ?? 1;
  await sql`
    update notification_outbox
    set status = ${giveUp ? 'failed' : 'pending'},
        send_after = case when ${giveUp} then send_after else now() + make_interval(mins => ${delay}) end,
        locked_until = null,
        last_error = ${describeError(error)}
    where id = ${row.id} and status = 'sending'
  `;
  return giveUp ? 'failed' : 'retrying';
}

/** Error text for last_error, with email addresses removed (Agent rule 17). */
export function describeError(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return text.replace(/[^\s@<>"']+@[^\s@<>"']+/g, '[email]').slice(0, 500);
}
