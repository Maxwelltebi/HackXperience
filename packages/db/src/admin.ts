import {
  ApiError,
  CIREN_ORG_ID,
  EVENT_STATUSES,
  type AdminPeople,
  type AdminPerson,
  type PlatformAdmin,
  type EventStatus,
} from '@hx/shared';
import { audit } from './audit';
import type { ISql } from './client';

// The platform admin area (R43). Platform admins are users with is_platform_admin, which the
// database derives from a fixed list of at most two emails (R44, migration 0015): the app can't
// make anyone an admin. Admins manage who organizes CIReN events, see every event, and have owner
// rights at every event (loadEventRoles). Every change here is audited.

/**
 * 404 unless the caller is a platform admin, signed in or not, so the admin endpoints don't
 * reveal that they exist (R44). Returns the admin's user id.
 */
export async function assertPlatformAdmin(sql: ISql, userId: string | null): Promise<string> {
  const [row] = userId
    ? await sql<[{ is_platform_admin: boolean }?]>`
        select is_platform_admin from users where id = ${userId}
      `
    : [];
  if (!userId || !row?.is_platform_admin) throw new ApiError('NOT_FOUND', 'Not found.');
  return userId;
}

// ---------- Overview ----------

export interface PlatformCounts {
  accounts: number;
  organizers: number;
  admins: number;
  events: Record<EventStatus, number>;
  deletedEvents: number;
  alertSubscribers: number;
  emails: { pending: number; failed: number; oldestPendingAt: string | null };
}

export async function getPlatformCounts(sql: ISql): Promise<PlatformCounts> {
  const [counts] = await sql<
    [
      {
        accounts: number;
        organizers: number;
        admins: number;
        deleted_events: number;
        alert_subscribers: number;
        pending: number;
        failed: number;
        oldest_pending: Date | null;
      },
    ]
  >`
    select (select count(*)::int from users) as accounts,
           (select count(distinct user_id)::int from org_members) as organizers,
           (select count(*)::int from users where is_platform_admin) as admins,
           (select count(*)::int from events where deleted_at is not null) as deleted_events,
           (select count(*)::int from alert_subscribers where unsubscribed_at is null)
             as alert_subscribers,
           (select count(*)::int from notification_outbox
            where channel = 'email' and status in ('pending', 'sending')) as pending,
           (select count(*)::int from notification_outbox
            where channel = 'email' and status = 'failed') as failed,
           (select min(created_at) from notification_outbox
            where channel = 'email' and status = 'pending') as oldest_pending
  `;
  const byStatus = await sql<{ status: EventStatus; n: number }[]>`
    select status::text as status, count(*)::int as n from events
    where deleted_at is null group by status
  `;
  const events = Object.fromEntries(EVENT_STATUSES.map((s) => [s, 0])) as Record<
    EventStatus,
    number
  >;
  for (const row of byStatus) events[row.status] = row.n;
  return {
    accounts: counts.accounts,
    organizers: counts.organizers,
    admins: counts.admins,
    events,
    deletedEvents: counts.deleted_events,
    alertSubscribers: counts.alert_subscribers,
    emails: {
      pending: counts.pending,
      failed: counts.failed,
      oldestPendingAt: counts.oldest_pending?.toISOString() ?? null,
    },
  };
}

export type TickHealth =
  /** No pg_cron here (local and CI databases). */
  | { state: 'unavailable' }
  /** pg_cron runs, but the Vault has no tick URL or secret: nothing is called. */
  | { state: 'not_set_up' }
  /** Set up; the latest call's HTTP status, if Supabase still has it (kept about 6 hours). */
  | { state: 'set_up'; lastCallAt: string | null; lastStatus: number | null };

/**
 * Is the per-minute tick running? Reads pg_cron, Vault and pg_net, which exist only on Supabase
 * projects; anything missing or unreadable reports "unavailable" instead of failing the page.
 */
export async function getTickHealth(sql: ISql): Promise<TickHealth> {
  try {
    const [present] = await sql<[{ cron: boolean; vault: boolean; net: boolean }]>`
      select to_regclass('cron.job') is not null as cron,
             to_regclass('vault.decrypted_secrets') is not null as vault,
             to_regclass('net._http_response') is not null as net
    `;
    if (!present.cron || !present.vault) return { state: 'unavailable' };
    const [secrets] = await sql<[{ n: number }]>`
      select count(*)::int as n from vault.decrypted_secrets
      where name in ('hx_tick_url', 'hx_tick_secret')
    `;
    if (secrets.n < 2) return { state: 'not_set_up' };
    if (!present.net) return { state: 'set_up', lastCallAt: null, lastStatus: null };
    const [last] = await sql<[{ created: Date; status_code: number | null }?]>`
      select created, status_code from net._http_response order by created desc limit 1
    `;
    return {
      state: 'set_up',
      lastCallAt: last?.created.toISOString() ?? null,
      lastStatus: last?.status_code ?? null,
    };
  } catch {
    return { state: 'unavailable' };
  }
}

// ---------- Events ----------

export interface PlatformEvent {
  id: string;
  name: string;
  slug: string;
  status: EventStatus;
  timezone: string;
  starts_at: string;
  ends_at: string;
  deleted_at: string | null;
  owners: string[];
  applications: number;
  confirmed: number;
}

/** Every event, drafts and deleted ones included: live and upcoming first, deleted last. */
export async function listPlatformEvents(sql: ISql): Promise<PlatformEvent[]> {
  const rows = await sql<
    (Omit<PlatformEvent, 'starts_at' | 'ends_at' | 'deleted_at'> & {
      starts_at: Date;
      ends_at: Date;
      deleted_at: Date | null;
    })[]
  >`
    select e.id, e.name, e.slug, e.status::text as status, e.timezone,
           e.starts_at, e.ends_at, e.deleted_at,
           coalesce((select array_agg(u.name order by u.name)
                     from event_staff s join users u on u.id = s.user_id
                     where s.event_id = e.id and s.role = 'owner'), '{}') as owners,
           (select count(*)::int from applications a where a.event_id = e.id) as applications,
           (select count(*)::int from applications a
            where a.event_id = e.id and a.status = 'confirmed') as confirmed
    from events e
    order by e.deleted_at is not null, e.ends_at < now(), e.starts_at desc
  `;
  return rows.map((r) => ({
    ...r,
    starts_at: r.starts_at.toISOString(),
    ends_at: r.ends_at.toISOString(),
    deleted_at: r.deleted_at?.toISOString() ?? null,
  }));
}

// ---------- People ----------

type PersonRow = Omit<AdminPerson, 'created_at'> & { created_at: Date };

const toPerson = (row: PersonRow): AdminPerson => ({
  ...row,
  created_at: row.created_at.toISOString(),
});

export async function listPlatformPeople(sql: ISql): Promise<AdminPeople> {
  const [organizers, admins] = await Promise.all([
    sql<PersonRow[]>`
      select u.id, u.name, u.email, p.avatar_url, u.created_at
      from org_members m
      join users u on u.id = m.user_id
      left join profiles p on p.user_id = u.id
      where m.org_id = ${CIREN_ORG_ID}
      order by lower(u.name)
    `,
    // The fixed list (R44), with the account behind each address once it has signed in.
    sql<PlatformAdmin[]>`
      select a.email, u.id, u.name, coalesce(u.is_platform_admin, false) as active
      from platform_admin_emails a
      left join users u on lower(u.email) = a.email
      order by a.added_at, a.email
    `,
  ]);
  return { organizers: organizers.map(toPerson), admins };
}

/** The account with this email; 404 USER_NOT_FOUND if nobody has signed in with it yet. */
async function findUser(sql: ISql, email: string): Promise<{ id: string; name: string }> {
  const [user] = await sql<[{ id: string; name: string }?]>`
    select id, name from users where lower(email) = ${email.toLowerCase()}
  `;
  if (!user) {
    throw new ApiError(
      'USER_NOT_FOUND',
      'Nobody has signed in with that email yet. Ask them to sign in to HackXperience once, then add them.',
      { fields: { email: 'No account with this email.' } },
    );
  }
  return user;
}

/** POST /admin/organizers: lets an existing account create CIReN events. Adding twice is harmless. */
export async function addOrganizer(sql: ISql, actorId: string, email: string): Promise<void> {
  const user = await findUser(sql, email);
  const added = await sql`
    insert into org_members (org_id, user_id) values (${CIREN_ORG_ID}, ${user.id})
    on conflict do nothing
    returning user_id
  `;
  if (added.length === 0) return;
  await audit(sql, {
    actorId,
    action: 'org.member_added',
    entityType: 'org_member',
    entityId: user.id,
    after: { org_id: CIREN_ORG_ID, name: user.name },
  });
}

/** DELETE /admin/organizers/{userId}. Their events and event roles stay as they are. */
export async function removeOrganizer(sql: ISql, actorId: string, userId: string): Promise<void> {
  const removed = await sql`
    delete from org_members where org_id = ${CIREN_ORG_ID} and user_id = ${userId}
    returning user_id
  `;
  if (removed.length === 0) throw new ApiError('NOT_FOUND', "They aren't an organizer.");
  await audit(sql, {
    actorId,
    action: 'org.member_removed',
    entityType: 'org_member',
    entityId: userId,
    before: { org_id: CIREN_ORG_ID },
  });
}
