import { ApiError, type OrganizerTeam } from '@hx/shared';
import { audit } from './audit';
import type { ISql } from './client';

// Soft delete and restore (build plan Phase 7 item 4, DESIGN Step 3 decision 6): owner only,
// audited. Every list and lookup already filters deleted_at, so a deleted row disappears
// everywhere at once and restore brings it back exactly as it was.

/**
 * The owner check for a deleted event, which the normal event loader can't see. Platform admins
 * pass too (R43).
 */
async function assertOwner(sql: ISql, eventId: string, userId: string): Promise<void> {
  const rows = await sql`
    select 1 from event_staff where event_id = ${eventId} and user_id = ${userId} and role = 'owner'
    union all
    select 1 from users where id = ${userId} and is_platform_admin
  `;
  if (rows.length === 0) throw new ApiError('NOT_FOUND', 'No such event.');
}

/** DELETE /events/{id}: owner. */
export async function deleteEvent(sql: ISql, eventId: string, actorId: string): Promise<void> {
  await assertOwner(sql, eventId, actorId);
  const done = await sql`
    update events set deleted_at = now() where id = ${eventId} and deleted_at is null returning id
  `;
  if (done.length === 0) throw new ApiError('NOT_FOUND', 'No such event.');
  await audit(sql, {
    eventId,
    actorId,
    action: 'event.deleted',
    entityType: 'event',
    entityId: eventId,
  });
}

/** POST /events/{id}/restore: owner. */
export async function restoreEvent(sql: ISql, eventId: string, actorId: string): Promise<void> {
  await assertOwner(sql, eventId, actorId);
  const done = await sql`
    update events set deleted_at = null where id = ${eventId} and deleted_at is not null returning id
  `;
  if (done.length === 0) throw new ApiError('NOT_FOUND', 'Nothing to restore.');
  await audit(sql, {
    eventId,
    actorId,
    action: 'event.restored',
    entityType: 'event',
    entityId: eventId,
  });
}

/** Deleted events the user owns (every deleted event, for a platform admin), for the restore list. */
export async function listDeletedEvents(
  sql: ISql,
  userId: string,
): Promise<{ id: string; name: string; deleted_at: string }[]> {
  const rows = await sql<{ id: string; name: string; deleted_at: Date }[]>`
    select e.id, e.name, e.deleted_at from events e
    where e.deleted_at is not null
      and (
        exists (select 1 from event_staff s
                where s.event_id = e.id and s.user_id = ${userId} and s.role = 'owner')
        or exists (select 1 from users u where u.id = ${userId} and u.is_platform_admin)
      )
    order by e.deleted_at desc
  `;
  return rows.map((r) => ({ ...r, deleted_at: r.deleted_at.toISOString() }));
}

type Kind = 'team' | 'submission';
const TABLE = { team: 'teams', submission: 'submissions' } as const;

/**
 * DELETE /events/{id}/teams/{tid} and /submissions/{sid}, and their /restore: owner. A deleted
 * team keeps its members, so restoring it is exact; while deleted, its members are still on it
 * (they can't join another team) and its project leaves standings, the gallery and reports.
 */
export async function setDeleted(
  sql: ISql,
  kind: Kind,
  eventId: string,
  id: string,
  actorId: string,
  deleted: boolean,
): Promise<void> {
  // Lock order: event first (Agent rule 8).
  await sql`select id from events where id = ${eventId} for share`;
  const done = await sql`
    update ${sql(TABLE[kind])}
    set deleted_at = ${deleted ? sql`now()` : null}
    where id = ${id} and event_id = ${eventId}
      and deleted_at is ${deleted ? sql`null` : sql`not null`}
    returning id
  `;
  if (done.length === 0) {
    throw new ApiError('NOT_FOUND', deleted ? `No such ${kind}.` : 'Nothing to restore.');
  }
  await audit(sql, {
    eventId,
    actorId,
    action: `${kind}.${deleted ? 'deleted' : 'restored'}`,
    entityType: kind,
    entityId: id,
  });
}

/** Every team at the event, deleted ones included, for the organizer Teams screen. */
export async function listTeamsForOrganizer(sql: ISql, eventId: string): Promise<OrganizerTeam[]> {
  const rows = await sql<
    {
      id: string;
      name: string;
      members: string[];
      deleted_at: Date | null;
      submission_id: string | null;
      title: string | null;
      status: string | null;
      submission_deleted_at: Date | null;
    }[]
  >`
    select t.id, t.name, t.deleted_at,
           coalesce((select array_agg(u.name order by m.joined_at) from team_members m
                     join users u on u.id = m.user_id where m.team_id = t.id), '{}') as members,
           s.id as submission_id, s.title, s.status::text as status, s.deleted_at as submission_deleted_at
    from teams t left join submissions s on s.team_id = t.id
    where t.event_id = ${eventId}
    order by t.deleted_at nulls first, lower(t.name), t.id
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    members: r.members,
    deleted_at: r.deleted_at?.toISOString() ?? null,
    submission: r.submission_id
      ? {
          id: r.submission_id,
          title: r.title ?? '',
          status: r.status ?? 'draft',
          deleted_at: r.submission_deleted_at?.toISOString() ?? null,
        }
      : null,
  }));
}
