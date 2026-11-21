import {
  applicationsOpen,
  decideApplication,
  generateTicketCode,
  rsvpApplication,
  validateAnswers,
} from '@hx/core';
import {
  ApiError,
  APPLICATION_STATUSES,
  DECISION_EMAIL_DELAY_MINUTES,
  type Answers,
  type ApplicationCounts,
  type ApplicationListItem,
  type ApplicationListQuery,
  type ApplicationListResponse,
  type ApplicationStatus,
  type DecisionStatus,
  type DecisionsResponse,
  type MyApplication,
  type SkillRatings,
} from '@hx/shared';
import { audit } from './audit';
import type { ISql } from './client';
import { iso, containsPattern } from './rows';

interface MyApplicationRow {
  id: string;
  event_id: string;
  status: ApplicationStatus;
  answers: Answers;
  skill_ratings: SkillRatings | null;
  ticket_code: string | null;
  created_at: Date;
  decided_at: Date | null;
}

function toMyApplication(row: MyApplicationRow): MyApplication {
  return {
    id: row.id,
    event_id: row.event_id,
    status: row.status,
    answers: row.answers,
    skill_ratings: row.skill_ratings,
    ticket_code: row.ticket_code,
    created_at: iso(row.created_at),
    decided_at: iso(row.decided_at),
  };
}

export async function getMyApplication(
  sql: ISql,
  eventId: string,
  userId: string,
): Promise<MyApplication | null> {
  const [row] = await sql<[MyApplicationRow?]>`
    select id, event_id, status, answers, skill_ratings, ticket_code, created_at, decided_at
    from applications where event_id = ${eventId} and user_id = ${userId}
  `;
  return row ? toMyApplication(row) : null;
}

/**
 * POST /events/{id}/applications. Only while applications are open (database clock).
 * Applying twice returns the first application unchanged, so a retry is harmless.
 */
export async function applyToEvent(
  sql: ISql,
  eventId: string,
  userId: string,
  answers: Answers,
  skillRatings: SkillRatings | null = null,
): Promise<{ application: MyApplication; created: boolean }> {
  const [event] = await sql<
    [
      {
        status: Parameters<typeof applicationsOpen>[0]['status'];
        applications_open_at: Date | null;
        applications_close_at: Date | null;
        application_questions: Parameters<typeof validateAnswers>[0];
        now: Date;
      }?,
    ]
  >`
    select status, applications_open_at, applications_close_at, application_questions, now() as now
    from events where id = ${eventId} and deleted_at is null
    for share
  `;
  if (!event) throw new ApiError('NOT_FOUND', 'No such event.');

  const existing = await getMyApplication(sql, eventId, userId);
  if (existing) return { application: existing, created: false };

  const open = applicationsOpen(
    {
      status: event.status,
      applications_open_at: iso(event.applications_open_at),
      applications_close_at: iso(event.applications_close_at),
      deleted_at: null,
    },
    event.now,
  );
  if (!open) throw new ApiError('APPLICATIONS_CLOSED', 'Applications for this event are not open.');

  const checked = validateAnswers(event.application_questions, answers);
  if (!checked.ok) throw ApiError.validation('Some answers need fixing.', checked.fields);

  const [row] = await sql<[MyApplicationRow?]>`
    insert into applications (event_id, user_id, answers, skill_ratings)
    values (${eventId}, ${userId}, ${sql.json(checked.answers)},
            ${skillRatings ? sql.json(skillRatings) : null})
    on conflict (event_id, user_id) do nothing
    returning id, event_id, status, answers, skill_ratings, ticket_code, created_at, decided_at
  `;
  if (row) return { application: toMyApplication(row), created: true };
  const raced = await getMyApplication(sql, eventId, userId);
  if (!raced) throw new Error('application vanished after conflict');
  return { application: raced, created: false };
}

/** POST /events/{id}/applications/me/rsvp. Confirming creates the ticket code. Run inside tx(). */
export async function rsvp(
  sql: ISql,
  eventId: string,
  userId: string,
  response: 'confirm' | 'decline',
): Promise<MyApplication> {
  const [event] = await sql<[{ status: string }?]>`
    select status from events where id = ${eventId} and deleted_at is null for share
  `;
  if (!event) throw new ApiError('NOT_FOUND', 'No such event.');
  if (event.status !== 'published' && event.status !== 'live') {
    throw new ApiError('INVALID_TRANSITION', 'RSVPs are closed for this event.');
  }

  const [current] = await sql<[MyApplicationRow?]>`
    select id, event_id, status, answers, skill_ratings, ticket_code, created_at, decided_at
    from applications where event_id = ${eventId} and user_id = ${userId}
    for update
  `;
  if (!current) throw new ApiError('NOT_FOUND', "You haven't applied to this event.");

  const change = rsvpApplication(current.status, response);
  if (change.kind === 'unchanged') return toMyApplication(current);
  if (change.kind === 'refused') throw new ApiError('INVALID_TRANSITION', change.reason);

  const ticket =
    change.to === 'confirmed' ? (current.ticket_code ?? generateTicketCode()) : current.ticket_code;
  const [row] = await sql<[MyApplicationRow]>`
    update applications set status = ${change.to}, ticket_code = ${ticket}
    where id = ${current.id}
    returning id, event_id, status, answers, skill_ratings, ticket_code, created_at, decided_at
  `;
  await audit(sql, {
    eventId,
    actorId: userId,
    action: 'application.rsvp',
    entityType: 'application',
    entityId: current.id,
    before: { status: current.status },
    after: { status: change.to },
  });
  return toMyApplication(row);
}

/**
 * PUT /events/{id}/applications/me/skills: add or change your skill ratings (R36), for people
 * who applied before ratings existed. Not after the submission deadline: teams are final then.
 * Run inside tx().
 */
export async function setMySkills(
  sql: ISql,
  eventId: string,
  userId: string,
  skillRatings: SkillRatings,
): Promise<MyApplication> {
  const [event] = await sql<[{ open: boolean }?]>`
    select (submissions_locked_at is null and now() < submission_deadline) as open
    from events where id = ${eventId} and deleted_at is null
    for share
  `;
  if (!event) throw new ApiError('NOT_FOUND', 'No such event.');
  if (!event.open) {
    throw new ApiError('SUBMISSION_LOCKED', 'Teams are final, so ratings can no longer change.');
  }
  const [row] = await sql<[MyApplicationRow?]>`
    update applications set skill_ratings = ${sql.json(skillRatings)}
    where event_id = ${eventId} and user_id = ${userId}
    returning id, event_id, status, answers, skill_ratings, ticket_code, created_at, decided_at
  `;
  if (!row) throw new ApiError('NOT_FOUND', "You haven't applied to this event.");
  return toMyApplication(row);
}

// ---------- Organizer review ----------

interface ListRow {
  id: string;
  user_id: string;
  name: string;
  email: string;
  school: string | null;
  level_of_study: string | null;
  graduation_year: number | null;
  country: string | null;
  github_username: string | null;
  status: ApplicationStatus;
  answers: Answers;
  skill_ratings: SkillRatings | null;
  created_at: Date;
  decided_at: Date | null;
  /** created_at with microseconds; a JS Date keeps only milliseconds. */
  cursor_at: string;
}

/** Cursor = base64url of [created_at with microseconds, id] of the last row on the page. */
function encodeCursor(row: ListRow): string {
  return Buffer.from(JSON.stringify([row.cursor_at, row.id])).toString('base64url');
}

function decodeCursor(cursor: string): [string, string] {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === 'string' &&
      typeof value[1] === 'string' &&
      !Number.isNaN(Date.parse(value[0]))
    ) {
      return [value[0], value[1]];
    }
  } catch {
    // fall through
  }
  throw ApiError.validation('That page link is no longer valid.', { cursor: 'Invalid cursor.' });
}

/** GET /events/{id}/applications: oldest first, filtered by status and a search, with tab counts. */
export async function listApplications(
  sql: ISql,
  eventId: string,
  query: ApplicationListQuery,
): Promise<ApplicationListResponse> {
  const after = query.cursor ? decodeCursor(query.cursor) : null;
  const search = query.q ? containsPattern(query.q) : null;

  const rows = await sql<ListRow[]>`
    select a.id, a.user_id, u.name, u.email, p.school, p.level_of_study, p.graduation_year,
           p.country, p.github_username, a.status, a.answers, a.skill_ratings, a.created_at,
           a.decided_at,
           to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_at
    from applications a
    join users u on u.id = a.user_id
    join profiles p on p.user_id = a.user_id
    where a.event_id = ${eventId}
      ${query.status ? sql`and a.status = ${query.status}` : sql``}
      ${search ? sql`and (u.name ilike ${search} or u.email ilike ${search} or p.school ilike ${search})` : sql``}
      ${after ? sql`and (a.created_at, a.id) > (${after[0]}::timestamptz, ${after[1]}::uuid)` : sql``}
    order by a.created_at, a.id
    limit ${query.limit + 1}
  `;

  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    items: page.map(toListItem),
    next_cursor: rows.length > query.limit && last ? encodeCursor(last) : null,
    counts: await countApplications(sql, eventId),
  };
}

function toListItem({ cursor_at: _cursor, ...row }: ListRow): ApplicationListItem {
  return { ...row, created_at: iso(row.created_at), decided_at: iso(row.decided_at) };
}

export async function countApplications(sql: ISql, eventId: string): Promise<ApplicationCounts> {
  const rows = await sql<{ status: ApplicationStatus; n: number }[]>`
    select status, count(*)::int as n from applications where event_id = ${eventId} group by status
  `;
  const counts = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0])) as Omit<
    ApplicationCounts,
    'all'
  >;
  let all = 0;
  for (const row of rows) {
    counts[row.status] = row.n;
    all += row.n;
  }
  return { all, ...counts };
}

/**
 * POST /events/{id}/applications/decisions. Run inside tx(). For every application that
 * changes: update it, write one audit row, and queue one decision email that waits
 * DECISION_EMAIL_DELAY_MINUTES (the undo window). A decision changed back within the
 * window revives its earlier, superseded email row instead of adding a duplicate.
 */
export async function decideApplications(
  sql: ISql,
  eventId: string,
  actorId: string,
  applicationIds: string[],
  status: DecisionStatus,
): Promise<DecisionsResponse> {
  // Sorted ids give a fixed lock order, so two bulk decisions can't deadlock.
  const rows = await sql<{ id: string; user_id: string; status: ApplicationStatus }[]>`
    select id, user_id, status from applications
    where event_id = ${eventId} and id = any(${applicationIds}::uuid[])
    order by id
    for update
  `;

  const found = new Set(rows.map((r) => r.id));
  const result: DecisionsResponse = {
    updated: [],
    unchanged: [],
    skipped: applicationIds
      .filter((id) => !found.has(id))
      .map((id) => ({ id, reason: 'not_found' })),
  };
  const changed: { id: string; user_id: string; from: ApplicationStatus }[] = [];
  for (const row of rows) {
    const change = decideApplication(row.status, status);
    if (change.kind === 'unchanged') result.unchanged.push(row.id);
    else if (change.kind === 'refused') result.skipped.push({ id: row.id, reason: change.reason });
    else changed.push({ id: row.id, user_id: row.user_id, from: row.status });
  }
  if (changed.length === 0) return result;

  const ids = changed.map((c) => c.id);
  const userIds = changed.map((c) => c.user_id);
  const previous = changed.map((c) => c.from);

  await sql`
    update applications set status = ${status}, decided_by = ${actorId}, decided_at = now()
    where id = any(${ids}::uuid[])
  `;
  await sql`
    insert into audit_log (event_id, actor_id, action, entity_type, entity_id, before, after)
    select ${eventId}, ${actorId}, 'application.decided', 'application', x.id,
           jsonb_build_object('status', x.previous), jsonb_build_object('status', ${status}::text)
    from unnest(${ids}::uuid[], ${previous}::text[]) as x(id, previous)
  `;
  await sql`
    insert into notification_outbox (user_id, channel, template, payload, dedupe_key, send_after)
    select x.user_id, 'email', 'application_decision',
           jsonb_build_object('application_id', x.id, 'event_id', ${eventId}::uuid, 'status', ${status}::text),
           -- A new decision after the applicant replied (declined or confirmed) gets its own
           -- email, even if the same decision was emailed before.
           'decision:' || x.id || ':' || ${status}::text
             || case when x.previous in ('declined', 'confirmed')
                  then ':reoffer:' || (extract(epoch from now()) * 1000)::bigint
                  else '' end,
           now() + make_interval(mins => ${DECISION_EMAIL_DELAY_MINUTES})
    from unnest(${ids}::uuid[], ${userIds}::uuid[], ${previous}::text[]) as x(id, user_id, previous)
    on conflict (dedupe_key) do update
      set status = 'pending', send_after = excluded.send_after, attempts = 0,
          last_error = null, locked_until = null
      where notification_outbox.status = 'superseded'
  `;
  result.updated = ids;
  return result;
}
