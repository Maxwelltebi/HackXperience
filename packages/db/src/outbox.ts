import {
  renderApplicationDecision,
  renderSubmissionReminder,
  renderTeamAssigned,
  renderStaffAdded,
  renderStaffInvite,
  type StaffRoleName,
  type RenderedEmail,
} from '@hx/emails';
import { formatDateTime } from '@hx/shared';
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
  /** Null only for staff invitations, which go to an email address with no account yet (R39). */
  user_id: string | null;
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
  channel: 'email' | 'push' = 'email',
): Promise<OutboxRow[]> {
  return sql<OutboxRow[]>`
    update notification_outbox o
    set status = 'sending',
        locked_until = now() + make_interval(mins => ${CLAIM_MINUTES}),
        attempts = o.attempts + 1
    where o.id in (
      select id from notification_outbox
      where status = 'pending' and channel = ${channel} and send_after <= now()
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

export type OutboxOutcome = 'sent' | 'superseded' | 'suppressed' | 'retrying' | 'failed';

async function deliver(sql: Sql, row: OutboxRow, deps: OutboxDeps): Promise<OutboxOutcome> {
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
  if (row.template === 'submission_reminder') return prepareReminder(sql, row, deps);
  if (row.template === 'team_assigned') return prepareTeamAssigned(sql, row, deps);
  if (row.template === 'staff_added') return prepareStaffAdded(sql, row, deps);
  if (row.template === 'staff_invite') return prepareStaffInvite(sql, row, deps);
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

/** "You're a judge at …" (R39). Superseded if the role was removed before it was sent. */
async function prepareStaffAdded(sql: Sql, row: OutboxRow, deps: OutboxDeps): Promise<Prepared> {
  const eventId = String(row.payload.event_id);
  const role = String(row.payload.role) as StaffRoleName;
  const [current] = await sql<[{ email: string; name: string; event_name: string }?]>`
    select u.email, u.name, e.name as event_name
    from event_staff s
    join users u on u.id = s.user_id
    join events e on e.id = s.event_id and e.deleted_at is null
    where s.event_id = ${eventId} and s.user_id = ${row.user_id} and s.role = ${role}
  `;
  if (!current) return { kind: 'superseded' };
  return {
    kind: 'send',
    to: current.email,
    email: renderStaffAdded({
      name: current.name,
      eventName: current.event_name,
      role,
      toolsUrl: `${deps.appUrl}/organize/${eventId}`,
    }),
  };
}

/** "You're invited to be a judge" (R39). Superseded once the invite is used or withdrawn. */
async function prepareStaffInvite(sql: Sql, row: OutboxRow, deps: OutboxDeps): Promise<Prepared> {
  const inviteId = String(row.payload.invite_id);
  const [invite] = await sql<
    [{ email: string; role: StaffRoleName; event_id: string; event_name: string; inviter: string }?]
  >`
    select i.email, i.role::text as role, i.event_id, e.name as event_name, u.name as inviter
    from staff_invites i
    join events e on e.id = i.event_id and e.deleted_at is null
    join users u on u.id = i.invited_by
    where i.id = ${inviteId}
  `;
  if (!invite) return { kind: 'superseded' };
  const next = encodeURIComponent(`/organize/${invite.event_id}`);
  return {
    kind: 'send',
    to: invite.email,
    email: renderStaffInvite({
      email: invite.email,
      eventName: invite.event_name,
      role: invite.role,
      inviterName: invite.inviter,
      signInUrl: `${deps.appUrl}/sign-in?next=${next}`,
    }),
  };
}

/** "You're on a team" (R36), re-checked at send time: superseded once they left or it was deleted. */
async function prepareTeamAssigned(sql: Sql, row: OutboxRow, deps: OutboxDeps): Promise<Prepared> {
  const teamId = String(row.payload.team_id);
  const [current] = await sql<
    [{ email: string; name: string; team_name: string; event_name: string; slug: string }?]
  >`
    select u.email, u.name, t.name as team_name, e.name as event_name, e.slug
    from team_members m
    join users u on u.id = m.user_id
    join teams t on t.id = m.team_id and t.deleted_at is null
    join events e on e.id = t.event_id and e.deleted_at is null
    where m.team_id = ${teamId} and m.user_id = ${row.user_id}
  `;
  if (!current) return { kind: 'superseded' };
  const others = await sql<{ name: string }[]>`
    select u.name from team_members m join users u on u.id = m.user_id
    where m.team_id = ${teamId} and m.user_id <> ${row.user_id}
    order by m.joined_at, u.name
  `;
  return {
    kind: 'send',
    to: current.email,
    email: renderTeamAssigned({
      name: current.name,
      eventName: current.event_name,
      teamName: current.team_name,
      teammates: others.map((o) => o.name),
      teamUrl: `${deps.appUrl}/events/${current.slug}/team`,
    }),
  };
}

/**
 * A deadline reminder, re-checked at send time: superseded once the team has submitted, the
 * person left the team or turned reminders off, or the deadline has passed.
 */
async function prepareReminder(sql: Sql, row: OutboxRow, deps: OutboxDeps): Promise<Prepared> {
  const kind = String(row.payload.kind);
  if (kind !== '24h' && kind !== '1h')
    return { kind: 'failed', reason: `unknown reminder ${kind}` };
  const eventId = String(row.payload.event_id);
  const teamId = String(row.payload.team_id);
  const [current] = await sql<
    [
      {
        email: string;
        name: string;
        timezone: string;
        email_reminders: boolean;
        event_name: string;
        slug: string;
        submission_deadline: Date;
        open: boolean;
        on_team: boolean;
        submitted: boolean;
      }?,
    ]
  >`
    select u.email, u.name, p.timezone, p.email_reminders,
           e.name as event_name, e.slug, e.submission_deadline,
           (e.submissions_locked_at is null and e.submission_deadline > now()
              and e.deleted_at is null) as open,
           exists (select 1 from team_members m
                   where m.team_id = ${teamId} and m.user_id = u.id) as on_team,
           exists (select 1 from submissions s
                   where s.team_id = ${teamId} and s.status = 'submitted') as submitted
    from users u
    join profiles p on p.user_id = u.id
    join events e on e.id = ${eventId}
    where u.id = ${row.user_id}
  `;
  if (!current?.open || !current.on_team || current.submitted || !current.email_reminders) {
    return { kind: 'superseded' };
  }
  return {
    kind: 'send',
    to: current.email,
    email: renderSubmissionReminder({
      name: current.name,
      eventName: current.event_name,
      kind,
      deadlineText: formatDateTime(current.submission_deadline.toISOString(), current.timezone),
      editorUrl: `${deps.appUrl}/events/${current.slug}/submission`,
    }),
  };
}

async function finish(
  sql: Sql,
  id: string,
  status: 'superseded' | 'suppressed' | 'failed',
  reason?: string,
): Promise<OutboxOutcome> {
  await sql`
    update notification_outbox
    set status = ${status}, locked_until = null, last_error = ${reason ?? null}
    where id = ${id} and status = 'sending'
  `;
  return status;
}

/** A failed attempt: retry after the next delay, or give up after MAX_ATTEMPTS. */
export async function markFailed(
  sql: Sql,
  row: OutboxRow,
  error: unknown,
): Promise<'retrying' | 'failed'> {
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
