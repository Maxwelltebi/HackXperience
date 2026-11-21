import {
  ApiError,
  LIVE_EVENT,
  liveTopics,
  MAX_ACTIVE_MENTOR_REQUESTS,
  type Announcement,
  type AnnouncementList,
  type LiveStats,
  type MentorRequest,
  type MentorRequestList,
  type MentorRequestStatus,
} from '@hx/shared';
import type { ISql } from './client';
import { iso } from './rows';

// ---------- Broadcasts ----------

let realtimeAvailable: boolean | undefined;

/**
 * Sends a hint on a private realtime channel from inside the caller's transaction, with
 * Supabase's realtime.send(): the message is a row in realtime.messages, so it is delivered
 * only if the transaction commits, and a rolled-back write sends nothing (build plan Phase 6
 * item 3). Without Supabase Realtime (a bare Postgres) it does nothing.
 */
export async function broadcast(
  sql: ISql,
  topic: string,
  payload: { type: string; version: number; [key: string]: unknown },
): Promise<void> {
  if (realtimeAvailable === undefined) {
    const [row] = await sql<[{ ok: boolean }]>`
      select to_regprocedure('realtime.send(jsonb, text, text, boolean)') is not null as ok
    `;
    realtimeAvailable = row.ok;
  }
  if (!realtimeAvailable) return;
  await sql`select realtime.send(${sql.json(payload as never)}, ${LIVE_EVENT}, ${topic}, true)`;
}

/** The database clock in milliseconds: the `version` of hints and of list reads. */
export async function liveVersion(sql: ISql): Promise<number> {
  const [row] = await sql<[{ v: string }]>`select (extract(epoch from now()) * 1000)::bigint as v`;
  return Number(row.v);
}

/** Counts for the staff dashboard (and what event:{id}:staff carries). */
export async function liveStats(sql: ISql, eventId: string): Promise<LiveStats> {
  const [row] = await sql<[Omit<LiveStats, 'version'> & { version: string }]>`
    select
      (select count(*)::int from applications where event_id = ${eventId} and status = 'confirmed') as confirmed,
      (select count(*)::int from check_ins where event_id = ${eventId}) as checked_in,
      (select count(*)::int from teams where event_id = ${eventId} and deleted_at is null) as teams,
      (select count(*)::int from submissions s join teams t on t.id = s.team_id and t.deleted_at is null
        where s.event_id = ${eventId} and s.status = 'submitted' and s.deleted_at is null) as submitted,
      (select count(*)::int from submissions s join teams t on t.id = s.team_id and t.deleted_at is null
        where s.event_id = ${eventId} and s.status = 'draft' and s.deleted_at is null) as drafts,
      (select count(*)::int from (
         select distinct sc.judge_id, sc.submission_id from scores sc
         join judge_assignments a on a.judge_id = sc.judge_id and a.submission_id = sc.submission_id
         where a.event_id = ${eventId}) x) as scores_in,
      (select count(*)::int from judge_assignments where event_id = ${eventId}) as scores_expected,
      (select count(*)::int from mentor_requests where event_id = ${eventId} and status = 'open') as mentor_open,
      (select count(*)::int from mentor_requests where event_id = ${eventId} and status = 'claimed') as mentor_claimed,
      (extract(epoch from now()) * 1000)::bigint as version
  `;
  return { ...row, version: Number(row.version) };
}

/** Sends the current counts to owners and admins on event:{id}:staff. Call inside the write. */
export async function broadcastStaffCounts(sql: ISql, eventId: string): Promise<void> {
  const stats = await liveStats(sql, eventId);
  await broadcast(sql, liveTopics.staff(eventId), { type: 'stats', ...stats });
}

// ---------- Announcements ----------

/**
 * POST /events/{id}/announcements (owner, admin). Saves it, queues one push per recipient who
 * has a device (confirmed participants and staff; build plan Phase 6 item 5), and hints the
 * announcements channel. `id` may come from the client: a retry returns the same announcement.
 */
export async function createAnnouncement(
  sql: ISql,
  eventId: string,
  authorId: string,
  id: string,
  body: { title: string; body: string },
): Promise<Announcement> {
  const inserted = await sql`
    insert into announcements (id, event_id, author_id, title, body, pushed_at)
    values (${id}, ${eventId}, ${authorId}, ${body.title}, ${body.body}, now())
    on conflict (id) do nothing
    returning id
  `;
  if (inserted.length > 0) {
    await sql`
      insert into notification_outbox (user_id, channel, template, payload, dedupe_key)
      select r.user_id, 'push', 'announcement',
             jsonb_build_object('announcement_id', ${id}::uuid, 'event_id', ${eventId}::uuid),
             'announcement:' || ${id}::text || ':' || r.user_id
      from (
        select user_id from applications where event_id = ${eventId} and status = 'confirmed'
        union
        select user_id from event_staff where event_id = ${eventId}
      ) r
      where exists (select 1 from push_tokens t where t.user_id = r.user_id and t.platform <> 'web')
      on conflict (dedupe_key) do nothing
    `;
    await broadcast(sql, liveTopics.announcements(eventId), {
      type: 'announcement.created',
      id,
      version: await liveVersion(sql),
    });
  }
  const [row] = await announcementRows(sql, eventId, { id });
  if (!row || row.event_id !== eventId) throw new ApiError('CONFLICT', 'That id is already used.');
  return row;
}

async function announcementRows(
  sql: ISql,
  eventId: string,
  filter: { id?: string; since?: string },
): Promise<Announcement[]> {
  const rows = await sql<
    {
      id: string;
      event_id: string;
      author_name: string;
      title: string;
      body: string;
      created_at: Date;
      pushed_at: Date | null;
    }[]
  >`
    select a.id, a.event_id, u.name as author_name, a.title, a.body, a.created_at, a.pushed_at
    from announcements a join users u on u.id = a.author_id
    where ${filter.id ? sql`a.id = ${filter.id}` : sql`a.event_id = ${eventId}`}
      ${filter.since ? sql`and a.created_at > ${filter.since}` : sql``}
    order by a.created_at desc, a.id
    limit 100
  `;
  return rows.map((r) => ({ ...r, created_at: iso(r.created_at), pushed_at: iso(r.pushed_at) }));
}

/** GET /events/{id}/announcements?since=: newest first. */
export async function listAnnouncements(
  sql: ISql,
  eventId: string,
  since?: string,
): Promise<AnnouncementList> {
  const version = await liveVersion(sql);
  return { items: await announcementRows(sql, eventId, { since }), version };
}

// ---------- Mentor queue ----------

const MENTOR_SELECT = (sql: ISql) => sql`
  select r.id, r.event_id, r.team_id, t.name as team_name, req.name as requested_by_name,
         r.topic, r.description, r.status, r.claimed_by, cl.name as claimed_by_name,
         r.created_at, r.claimed_at, r.resolved_at
  from mentor_requests r
  join teams t on t.id = r.team_id
  join users req on req.id = r.requested_by
  left join users cl on cl.id = r.claimed_by
`;

interface MentorRow extends Omit<MentorRequest, 'created_at' | 'claimed_at' | 'resolved_at'> {
  created_at: Date;
  claimed_at: Date | null;
  resolved_at: Date | null;
}

function toMentorRequest(row: MentorRow): MentorRequest {
  return {
    ...row,
    created_at: iso(row.created_at),
    claimed_at: iso(row.claimed_at),
    resolved_at: iso(row.resolved_at),
  };
}

async function getMentorRequest(sql: ISql, id: string): Promise<MentorRequest> {
  const [row] = await sql<[MentorRow?]>`${MENTOR_SELECT(sql)} where r.id = ${id}`;
  if (!row) throw new ApiError('NOT_FOUND', 'No such request.');
  return toMentorRequest(row);
}

/** Hints the mentors' queue, the team, and the staff counters about a request change. */
async function announceMentorChange(sql: ISql, request: MentorRequest, type: string) {
  const version = await liveVersion(sql);
  await broadcast(sql, liveTopics.mentors(request.event_id), { type, id: request.id, version });
  await broadcast(sql, liveTopics.team(request.team_id), { type, id: request.id, version });
  await broadcastStaffCounts(sql, request.event_id);
}

/**
 * POST /events/{id}/mentor-requests (a team member, while the event is live). A team may have
 * at most MAX_ACTIVE_MENTOR_REQUESTS open or claimed requests. Retry-safe with a client id.
 */
export async function createMentorRequest(
  sql: ISql,
  eventId: string,
  userId: string,
  id: string,
  body: { topic: string; description: string },
): Promise<MentorRequest> {
  const [event] = await sql<[{ status: string }?]>`
    select status from events where id = ${eventId} and deleted_at is null for share
  `;
  if (event?.status !== 'live') {
    throw new ApiError('MENTORING_CLOSED', 'Mentors take requests while the event is live.');
  }
  const [membership] = await sql<[{ team_id: string }?]>`
    select m.team_id from team_members m
    join teams t on t.id = m.team_id and t.deleted_at is null
    where m.event_id = ${eventId} and m.user_id = ${userId}
  `;
  if (!membership) throw new ApiError('NOT_ON_TEAM', 'Join a team to ask a mentor for help.');
  // Serialize this team's requests (lock order: event, then team).
  await sql`select id from teams where id = ${membership.team_id} for update`;

  const [existing] = await sql<
    [{ team_id: string }?]
  >`select team_id from mentor_requests where id = ${id}`;
  if (existing) {
    if (existing.team_id !== membership.team_id)
      throw new ApiError('CONFLICT', 'That id is already used.');
    return getMentorRequest(sql, id);
  }
  const [{ active }] = await sql<[{ active: number }]>`
    select count(*)::int as active from mentor_requests
    where team_id = ${membership.team_id} and status in ('open', 'claimed')
  `;
  if (active >= MAX_ACTIVE_MENTOR_REQUESTS) {
    throw new ApiError(
      'CONFLICT',
      `Your team already has ${active} requests waiting. Cancel one or wait for a mentor.`,
    );
  }
  await sql`
    insert into mentor_requests (id, event_id, team_id, requested_by, topic, description)
    values (${id}, ${eventId}, ${membership.team_id}, ${userId}, ${body.topic}, ${body.description})
  `;
  const request = await getMentorRequest(sql, id);
  await announceMentorChange(sql, request, 'mentor_request.created');
  return request;
}

/** GET /events/{id}/mentor-requests?status=: mentors and organizers. Open first, oldest first. */
export async function listMentorRequests(
  sql: ISql,
  eventId: string,
  status?: MentorRequestStatus,
): Promise<MentorRequestList> {
  const version = await liveVersion(sql);
  const rows = await sql<MentorRow[]>`
    ${MENTOR_SELECT(sql)}
    where r.event_id = ${eventId} ${status ? sql`and r.status = ${status}` : sql``}
    order by case r.status when 'open' then 0 when 'claimed' then 1 else 2 end, r.created_at, r.id
    limit 200
  `;
  return { items: rows.map(toMentorRequest), version };
}

/** GET /events/{id}/teams/me/mentor-requests: the caller's team's requests, newest first. */
export async function listTeamMentorRequests(
  sql: ISql,
  eventId: string,
  userId: string,
): Promise<MentorRequestList> {
  const version = await liveVersion(sql);
  const rows = await sql<MentorRow[]>`
    ${MENTOR_SELECT(sql)}
    join team_members m on m.team_id = r.team_id and m.user_id = ${userId}
    where r.event_id = ${eventId}
    order by r.created_at desc, r.id
    limit 50
  `;
  return { items: rows.map(toMentorRequest), version };
}

/** The event of a mentor request, for loading the caller's roles. */
export async function mentorRequestEvent(sql: ISql, id: string): Promise<string> {
  const [row] = await sql<
    [{ event_id: string }?]
  >`select event_id from mentor_requests where id = ${id}`;
  if (!row) throw new ApiError('NOT_FOUND', 'No such request.');
  return row.event_id;
}

/**
 * POST /mentor-requests/{rid}/claim (a mentor): one conditional UPDATE, so of two mentors
 * claiming at the same moment exactly one wins; the other gets ALREADY_CLAIMED.
 */
export async function claimMentorRequest(
  sql: ISql,
  id: string,
  mentorId: string,
): Promise<MentorRequest> {
  const claimed = await sql`
    update mentor_requests set status = 'claimed', claimed_by = ${mentorId}, claimed_at = now()
    where id = ${id} and status = 'open'
    returning id
  `;
  if (claimed.length === 0) {
    const current = await getMentorRequest(sql, id);
    if (current.status === 'claimed') {
      throw new ApiError(
        'ALREADY_CLAIMED',
        `${current.claimed_by_name ?? 'Another mentor'} is already on it.`,
      );
    }
    throw new ApiError('INVALID_TRANSITION', `This request is ${current.status}.`);
  }
  const request = await getMentorRequest(sql, id);
  await announceMentorChange(sql, request, 'mentor_request.claimed');
  return request;
}

/** POST /mentor-requests/{rid}/resolve: the mentor who claimed it. */
export async function resolveMentorRequest(
  sql: ISql,
  id: string,
  mentorId: string,
): Promise<MentorRequest> {
  const done = await sql`
    update mentor_requests set status = 'resolved', resolved_at = now()
    where id = ${id} and status = 'claimed' and claimed_by = ${mentorId}
    returning id
  `;
  if (done.length === 0) {
    const current = await getMentorRequest(sql, id);
    throw new ApiError(
      'INVALID_TRANSITION',
      current.status === 'claimed'
        ? 'Only the mentor who claimed it can resolve it.'
        : `This request is ${current.status}.`,
    );
  }
  const request = await getMentorRequest(sql, id);
  await announceMentorChange(sql, request, 'mentor_request.resolved');
  return request;
}

/** POST /mentor-requests/{rid}/cancel: anyone on the requesting team, while open or claimed. */
export async function cancelMentorRequest(
  sql: ISql,
  id: string,
  userId: string,
): Promise<MentorRequest> {
  const done = await sql`
    update mentor_requests r set status = 'cancelled', resolved_at = now()
    where r.id = ${id} and r.status in ('open', 'claimed')
      and exists (select 1 from team_members m where m.team_id = r.team_id and m.user_id = ${userId})
    returning r.id
  `;
  if (done.length === 0) {
    const current = await getMentorRequest(sql, id);
    const member =
      await sql`select 1 from team_members where team_id = ${current.team_id} and user_id = ${userId}`;
    if (member.length === 0)
      throw new ApiError('FORBIDDEN', 'Only the team that asked can cancel it.');
    throw new ApiError('INVALID_TRANSITION', `This request is ${current.status}.`);
  }
  const request = await getMentorRequest(sql, id);
  await announceMentorChange(sql, request, 'mentor_request.cancelled');
  return request;
}
