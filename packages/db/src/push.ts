import type { Sql } from './client';
import { claimOutbox, CLAIM_LIMIT, describeError, markFailed, type OutboxRow } from './outbox';

/** One Expo push message (https://docs.expo.dev/push-notifications/sending-notifications/). */
export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export type PushTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message?: string; details?: { error?: string } };

export type PushReceipt = { status: 'ok' } | { status: 'error'; details?: { error?: string } };

/** Expo's push API. Implemented with fetch in the web app; faked in tests. */
export interface PushDeps {
  /** Up to 100 messages; returns one ticket per message, in order. Throws on network errors. */
  send: (messages: PushMessage[]) => Promise<PushTicket[]>;
  /** Receipts by ticket id. Throws on network errors. */
  getReceipts: (ids: string[]) => Promise<Record<string, PushReceipt>>;
  appUrl: string;
}

export interface PushResult {
  claimed: number;
  sent: number;
  superseded: number;
  retrying: number;
  failed: number;
}

const EXPO_BATCH = 100;
const DEVICE_NOT_REGISTERED = 'DeviceNotRegistered';

/** What a push outbox row should say, re-read at send time; null when it no longer applies. */
async function preparePush(
  sql: Sql,
  row: OutboxRow,
  appUrl: string,
): Promise<{ title: string; body: string; url: string } | null> {
  if (row.template === 'announcement') {
    const [a] = await sql<[{ title: string; body: string; slug: string; event_name: string }?]>`
      select a.title, a.body, e.slug, e.name as event_name
      from announcements a join events e on e.id = a.event_id
      where a.id = ${String(row.payload.announcement_id)}
    `;
    if (!a) return null;
    const body = a.body.length > 178 ? `${a.body.slice(0, 177)}…` : a.body;
    return { title: `${a.event_name}: ${a.title}`, body, url: `${appUrl}/events/${a.slug}` };
  }
  throw new Error(`unknown push template ${row.template}`);
}

/**
 * Sends due push rows through Expo in batches of 100 (build plan Phase 6 item 4). Tickets are
 * kept on the row (payload.tickets, with the token each went to) so the receipts step can find
 * dead tokens. A ticket that already says DeviceNotRegistered deletes its token at once. All
 * network calls happen after the claim committed (Agent rule 9).
 */
export async function processPushOutbox(
  sql: Sql,
  deps: PushDeps,
  options: { limit?: number; userIds?: string[] } = {},
): Promise<PushResult> {
  const rows = await claimOutbox(sql, options.limit ?? CLAIM_LIMIT, options.userIds, 'push');
  const result: PushResult = {
    claimed: rows.length,
    sent: 0,
    superseded: 0,
    retrying: 0,
    failed: 0,
  };

  const messages: { row: OutboxRow; token: string; message: PushMessage }[] = [];
  for (const row of rows) {
    let prepared: Awaited<ReturnType<typeof preparePush>>;
    try {
      prepared = await preparePush(sql, row, deps.appUrl);
    } catch (error) {
      result[await markFailed(sql, row, error)] += 1;
      continue;
    }
    const tokens = await sql<{ token: string }[]>`
      select token from push_tokens where user_id = ${row.user_id} and platform <> 'web'
    `;
    if (!prepared || tokens.length === 0) {
      await sql`
        update notification_outbox set status = 'superseded', locked_until = null,
               last_error = ${prepared ? 'no device' : 'no longer applies'}
        where id = ${row.id} and status = 'sending'
      `;
      result.superseded += 1;
      continue;
    }
    for (const { token } of tokens) {
      messages.push({
        row,
        token,
        message: {
          to: token,
          title: prepared.title,
          body: prepared.body,
          data: { url: prepared.url },
        },
      });
    }
  }

  const tickets = new Map<string, { id: string; token: string }[]>();
  const errored = new Map<string, unknown>();
  for (let i = 0; i < messages.length; i += EXPO_BATCH) {
    const batch = messages.slice(i, i + EXPO_BATCH);
    let answers: PushTicket[];
    try {
      answers = await deps.send(batch.map((m) => m.message));
    } catch (error) {
      for (const m of batch) errored.set(m.row.id, error);
      continue;
    }
    for (const [j, m] of batch.entries()) {
      const ticket = answers[j];
      if (ticket?.status === 'ok') {
        tickets.set(m.row.id, [
          ...(tickets.get(m.row.id) ?? []),
          { id: ticket.id, token: m.token },
        ]);
      } else if (ticket?.details?.error === DEVICE_NOT_REGISTERED) {
        await sql`delete from push_tokens where token = ${m.token}`;
      }
    }
  }

  const byRow = new Map(messages.map((m) => [m.row.id, m.row]));
  for (const [rowId, row] of byRow) {
    const sent = tickets.get(rowId);
    if (sent && sent.length > 0) {
      await sql`
        update notification_outbox
        set status = 'sent', sent_at = now(), locked_until = null, last_error = null,
            payload = payload || ${sql.json({ tickets: sent })}
        where id = ${rowId} and status = 'sending'
      `;
      result.sent += 1;
    } else if (errored.has(rowId)) {
      result[await markFailed(sql, row, errored.get(rowId))] += 1;
    } else {
      // Every device refused (unregistered tokens are already deleted).
      await sql`
        update notification_outbox set status = 'superseded', locked_until = null, last_error = 'no device'
        where id = ${rowId} and status = 'sending'
      `;
      result.superseded += 1;
    }
  }
  return result;
}

/**
 * Tick step: reads Expo receipts for pushes sent at least `minutes` ago (Expo suggests 15) and
 * deletes tokens whose receipt says DeviceNotRegistered. Rows are marked checked; a network
 * error leaves them for the next tick.
 */
export async function checkPushReceipts(
  sql: Sql,
  deps: PushDeps,
  options: { minutes?: number; userIds?: string[] } = {},
): Promise<{ checked: number; removed: number }> {
  const rows = await sql<{ id: string; tickets: { id: string; token: string }[] }[]>`
    select id, payload->'tickets' as tickets from notification_outbox
    where channel = 'push' and status = 'sent' and payload ? 'tickets'
      and not (payload ? 'receipts_checked')
      and sent_at <= now() - make_interval(mins => ${options.minutes ?? 15})
      ${options.userIds ? sql`and user_id = any(${options.userIds}::uuid[])` : sql``}
    order by sent_at
    limit 100
  `;
  if (rows.length === 0) return { checked: 0, removed: 0 };
  const all = rows.flatMap((r) => r.tickets);
  let receipts: Record<string, PushReceipt>;
  try {
    receipts = await deps.getReceipts(all.map((t) => t.id));
  } catch (error) {
    console.error(`[push] receipts failed: ${describeError(error)}`);
    return { checked: 0, removed: 0 };
  }
  let removed = 0;
  for (const ticket of all) {
    const receipt = receipts[ticket.id];
    if (receipt?.status === 'error' && receipt.details?.error === DEVICE_NOT_REGISTERED) {
      const deleted =
        await sql`delete from push_tokens where token = ${ticket.token} returning token`;
      removed += deleted.length;
    }
  }
  await sql`
    update notification_outbox set payload = payload || '{"receipts_checked": true}'::jsonb
    where id = any(${rows.map((r) => r.id)}::uuid[])
  `;
  return { checked: rows.length, removed };
}
