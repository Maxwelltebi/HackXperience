import { checkEventTransition, slugify, validateEventTimes } from '@hx/core';
import {
  ApiError,
  can,
  type ApplicationQuestion,
  type CreateEventBody,
  type Event,
  type EventStatus,
  type EventSummary,
  type StaffInvite,
  type StaffList,
  type StaffMember,
  type StaffRole,
  type UpdateEventBody,
} from '@hx/shared';
import { queuePublishedAlerts } from './alerts';
import { audit } from './audit';
import type { ISql } from './client';
import { buildResultsSnapshot } from './judging';
import { iso } from './rows';
import { lockSubmissionDeadline } from './submissions';

export interface EventRow {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description: string;
  timezone: string;
  mode: Event['mode'];
  location: string | null;
  applications_open_at: Date | null;
  applications_close_at: Date | null;
  starts_at: Date;
  submission_deadline: Date;
  ends_at: Date;
  team_size_min: number;
  team_size_max: number;
  max_tracks_per_submission: number;
  application_questions: ApplicationQuestion[];
  status: EventStatus;
  submissions_locked_at: Date | null;
  gallery_published_at: Date | null;
  deleted_at: Date | null;
}

const EVENT_COLUMNS = [
  'id',
  'organization_id',
  'name',
  'slug',
  'description',
  'timezone',
  'mode',
  'location',
  'applications_open_at',
  'applications_close_at',
  'starts_at',
  'submission_deadline',
  'ends_at',
  'team_size_min',
  'team_size_max',
  'max_tracks_per_submission',
  'application_questions',
  'status',
  'submissions_locked_at',
  'gallery_published_at',
  'deleted_at',
] as const;

export function toEvent(row: EventRow): Event {
  return {
    id: row.id,
    organization_id: row.organization_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    timezone: row.timezone,
    mode: row.mode,
    location: row.location,
    applications_open_at: iso(row.applications_open_at),
    applications_close_at: iso(row.applications_close_at),
    starts_at: iso(row.starts_at),
    submission_deadline: iso(row.submission_deadline),
    ends_at: iso(row.ends_at),
    team_size_min: row.team_size_min,
    team_size_max: row.team_size_max,
    max_tracks_per_submission: row.max_tracks_per_submission,
    application_questions: row.application_questions,
    status: row.status,
    submissions_locked_at: iso(row.submissions_locked_at),
    gallery_published_at: iso(row.gallery_published_at),
  };
}

/**
 * POST /events/{id}/gallery {published}: owners open the project gallery at any time, or hide
 * it again (R40). A completed event's gallery stays public either way. Audited. Run inside tx().
 */
export async function setGalleryPublished(
  sql: ISql,
  eventId: string,
  actorId: string,
  published: boolean,
): Promise<Event> {
  const [current] = await sql<[{ gallery_published_at: Date | null }?]>`
    select gallery_published_at from events where id = ${eventId} and deleted_at is null for update
  `;
  if (!current) throw new ApiError('NOT_FOUND', 'No such event.');
  if (published !== (current.gallery_published_at !== null)) {
    await sql`
      update events set gallery_published_at = ${published ? sql`now()` : null}
      where id = ${eventId}
    `;
    await audit(sql, {
      eventId,
      actorId,
      action: published ? 'event.gallery_published' : 'event.gallery_hidden',
      entityType: 'event',
      entityId: eventId,
      before: { gallery_published_at: iso(current.gallery_published_at) },
    });
  }
  const [row] = await sql<[EventRow]>`
    select ${sql(EVENT_COLUMNS)} from events where id = ${eventId}
  `;
  return toEvent(row);
}

export function toEventSummary(row: EventRow): EventSummary {
  const event = toEvent(row);
  return {
    id: event.id,
    name: event.name,
    slug: event.slug,
    status: event.status,
    mode: event.mode,
    location: event.location,
    timezone: event.timezone,
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    applications_open_at: event.applications_open_at,
    applications_close_at: event.applications_close_at,
  };
}

// ---------- Roles ----------

export interface EventAccess {
  event: EventRow;
  /** The caller's staff roles at this event; empty for participants and visitors. */
  roles: StaffRole[];
}

/**
 * The event (if it exists and isn't deleted) and the caller's roles at it
 * (DESIGN Step 4: one middleware loads the caller's roles for the event).
 */
export async function loadEventRoles(
  sql: ISql,
  eventId: string,
  userId: string | null,
): Promise<EventAccess | null> {
  const [row] = await sql<[(EventRow & { roles: StaffRole[] })?]>`
    select ${sql(EVENT_COLUMNS.map((c) => `e.${c}`))},
           array(
             select s.role::text from event_staff s
             where s.event_id = e.id and s.user_id = ${userId}
             order by s.role
           ) as roles
    from events e
    where e.id = ${eventId} and e.deleted_at is null
  `;
  if (!row) return null;
  const { roles, ...event } = row;
  return { event, roles };
}

/** Drafts are visible only to staff who can edit them; everything else is public. */
export function canSeeEvent(access: EventAccess): boolean {
  return access.event.status !== 'draft' || can(access.roles, 'event.view_staff');
}

// ---------- Reads ----------

export async function getEventBySlug(sql: ISql, slug: string): Promise<EventRow | null> {
  const [row] = await sql<[EventRow?]>`
    select ${sql(EVENT_COLUMNS)} from events where slug = ${slug} and deleted_at is null
  `;
  return row ?? null;
}

/** Every event that isn't a draft, soonest-starting upcoming first, then past events. */
export async function listPublicEvents(sql: ISql): Promise<EventRow[]> {
  return sql<EventRow[]>`
    select ${sql(EVENT_COLUMNS)} from events
    where status <> 'draft' and deleted_at is null
    order by (ends_at < now()), case when ends_at >= now() then starts_at end asc, starts_at desc
  `;
}

export interface StaffEventRow extends EventRow {
  roles: StaffRole[];
}

/** Events where the user has any staff role, drafts included, newest first. */
export async function listStaffEvents(sql: ISql, userId: string): Promise<StaffEventRow[]> {
  return sql<StaffEventRow[]>`
    select ${sql(EVENT_COLUMNS.map((c) => `e.${c}`))},
           array_agg(s.role::text order by s.role) as roles
    from events e
    join event_staff s on s.event_id = e.id and s.user_id = ${userId}
    where e.deleted_at is null
    group by e.id
    order by e.starts_at desc
  `;
}

export async function isOrgMember(sql: ISql, orgId: string, userId: string): Promise<boolean> {
  const rows = await sql`select 1 from org_members where org_id = ${orgId} and user_id = ${userId}`;
  return rows.length > 0;
}

// ---------- Writes ----------

/** Creates a draft event; the creator becomes its owner. Run inside tx(). */
export async function createEvent(
  sql: ISql,
  orgId: string,
  actorId: string,
  body: CreateEventBody,
): Promise<Event> {
  const values = {
    organization_id: orgId,
    name: body.name,
    slug: body.slug ?? (await freeSlug(sql, slugify(body.name))),
    description: body.description ?? '',
    timezone: body.timezone,
    mode: body.mode,
    location: body.location ?? null,
    applications_open_at: body.applications_open_at ?? null,
    applications_close_at: body.applications_close_at ?? null,
    starts_at: body.starts_at,
    submission_deadline: body.submission_deadline,
    ends_at: body.ends_at,
    team_size_min: body.team_size_min ?? 1,
    team_size_max: body.team_size_max ?? 4,
    max_tracks_per_submission: body.max_tracks_per_submission ?? 1,
  };
  throwIfInvalid(validateEventTimes(values));
  if (body.slug) await assertSlugFree(sql, body.slug, null);

  const [row] = await sql<[EventRow]>`
    insert into events ${sql(values)} returning ${sql(EVENT_COLUMNS)}
  `;
  await sql`insert into event_staff (event_id, user_id, role) values (${row.id}, ${actorId}, 'owner')`;
  await audit(sql, {
    eventId: row.id,
    actorId,
    action: 'event.created',
    entityType: 'event',
    entityId: row.id,
    after: { name: row.name, slug: row.slug },
  });
  return toEvent(row);
}

/** PATCH /events/{id}. Locks the event row, checks the merged result, saves, audits. */
export async function updateEvent(
  sql: ISql,
  eventId: string,
  actorId: string,
  patch: UpdateEventBody,
): Promise<Event> {
  const current = await lockEvent(sql, eventId);
  const merged = { ...toEvent(current), ...patch };
  throwIfInvalid(validateEventTimes(merged));
  if (patch.slug && patch.slug !== current.slug) await assertSlugFree(sql, patch.slug, eventId);

  const changes: Record<string, unknown> = {};
  const before: Record<string, unknown> = {};
  const currentApi = toEvent(current) as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (JSON.stringify(currentApi[key]) === JSON.stringify(value)) continue;
    changes[key] = key === 'application_questions' ? sql.json(value as never) : value;
    before[key] = currentApi[key];
  }
  if (Object.keys(changes).length === 0) return toEvent(current);

  const [row] = await sql<[EventRow]>`
    update events set ${sql(changes)} where id = ${eventId} returning ${sql(EVENT_COLUMNS)}
  `;
  const after = Object.fromEntries(
    Object.keys(changes).map((k) => [k, (toEvent(row) as Record<string, unknown>)[k]]),
  );
  await audit(sql, {
    eventId,
    actorId,
    action: 'event.updated',
    entityType: 'event',
    entityId: eventId,
    before: before as never,
    after: after as never,
  });
  return toEvent(row);
}

/** POST /events/{id}/status. Checked by the state machine against the database clock. */
export async function changeEventStatus(
  sql: ISql,
  eventId: string,
  actorId: string,
  to: EventStatus,
): Promise<Event> {
  const current = await lockEvent(sql, eventId);
  if (current.status === to) return toEvent(current);

  const [counts] = await sql<[{ now: Date; applications: number; rubric: number }]>`
    select now() as now,
           (select count(*)::int from applications where event_id = ${eventId}) as applications,
           (select count(*)::int from rubric_criteria where event_id = ${eventId}) as rubric
  `;
  const event = toEvent(current);
  const result = checkEventTransition(to, {
    event,
    now: counts.now,
    applicationCount: counts.applications,
    rubricCount: counts.rubric,
  });
  if (!result.ok) {
    throw new ApiError('INVALID_TRANSITION', result.reasons.join(' '), {
      from: current.status,
      to,
      reasons: result.reasons,
    });
  }

  // Event alerts (R42): the first time an event is published, in this same transaction.
  if (to === 'published' && current.status === 'draft') {
    await queuePublishedAlerts(sql, current, counts.now);
  }

  // Judging starts from locked submissions, even if the tick hasn't run the lock step yet.
  if (to === 'judging') await lockSubmissionDeadline(sql, eventId);

  const [row] = await sql<[EventRow]>`
    update events set status = ${to} where id = ${eventId} returning ${sql(EVENT_COLUMNS)}
  `;
  // Publishing results freezes them, in this same transaction (build plan Phase 5 item 5).
  if (to === 'completed') {
    const snapshot = await buildResultsSnapshot(sql, eventId, counts.now);
    await sql`update events set results_snapshot = ${sql.json(snapshot as never)} where id = ${eventId}`;
    await audit(sql, {
      eventId,
      actorId,
      action: 'results.published',
      entityType: 'event',
      entityId: eventId,
      after: { awards: snapshot.awards.length, projects: snapshot.projects },
    });
  }
  await audit(sql, {
    eventId,
    actorId,
    action: 'event.status_changed',
    entityType: 'event',
    entityId: eventId,
    before: { status: current.status },
    after: { status: to },
  });
  return toEvent(row);
}

/** SELECT ... FOR UPDATE on the event row (lock order: event first, Agent rule 8). */
export async function lockEvent(sql: ISql, eventId: string): Promise<EventRow> {
  const [row] = await sql<[EventRow?]>`
    select ${sql(EVENT_COLUMNS)} from events
    where id = ${eventId} and deleted_at is null
    for update
  `;
  if (!row) throw new ApiError('NOT_FOUND', 'No such event.');
  return row;
}

async function freeSlug(sql: ISql, base: string): Promise<string> {
  const taken = await sql<{ slug: string }[]>`
    select slug from events where slug = ${base} or slug like ${`${base}-%`}
  `;
  const names = new Set(taken.map((r) => r.slug));
  if (!names.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base.slice(0, 55)}-${n}`;
    if (!names.has(candidate)) return candidate;
  }
}

async function assertSlugFree(
  sql: ISql,
  slug: string,
  exceptEventId: string | null,
): Promise<void> {
  const rows =
    await sql`select id from events where slug = ${slug} and id is distinct from ${exceptEventId}`;
  if (rows.length > 0) {
    throw ApiError.validation('That web address is taken.', {
      slug: 'Another event uses this address.',
    });
  }
}

function throwIfInvalid(fields: Record<string, string>): void {
  if (Object.keys(fields).length > 0) throw ApiError.validation('Some fields need fixing.', fields);
}

// ---------- Staff ----------

export async function listStaff(sql: ISql, eventId: string): Promise<StaffMember[]> {
  return sql<StaffMember[]>`
    select s.user_id, u.name, u.email, s.role::text as role
    from event_staff s join users u on u.id = s.user_id
    where s.event_id = ${eventId}
    order by array_position(array['owner','admin','judge','mentor','volunteer'], s.role::text), u.name
  `;
}

/** Invitations still waiting for their person to sign in, oldest first. */
export async function listStaffInvites(sql: ISql, eventId: string): Promise<StaffInvite[]> {
  const rows = await sql<(Omit<StaffInvite, 'created_at'> & { created_at: Date })[]>`
    select id, email, role::text as role, created_at from staff_invites
    where event_id = ${eventId}
    order by created_at, email
  `;
  return rows.map((r) => ({ ...r, created_at: r.created_at.toISOString() }));
}

/** Staff and pending invitations together, as the staff endpoints return them. */
export async function listStaffAndInvites(sql: ISql, eventId: string): Promise<StaffList> {
  const [items, invites] = await Promise.all([
    listStaff(sql, eventId),
    listStaffInvites(sql, eventId),
  ]);
  return { items, invites };
}

/**
 * Adds a staff role by email (R39). Someone with an account gets the role now and a "you've been
 * added" email. Someone without one gets an invitation: the role waits in staff_invites, an email
 * asks them to sign in with that address, and their first sign-in claims it (database trigger).
 * Adding a role someone already has, or inviting twice, changes nothing. Run inside tx().
 */
export async function addStaff(
  sql: ISql,
  eventId: string,
  actorId: string,
  email: string,
  role: StaffRole,
): Promise<StaffList> {
  const [user] = await sql<
    [{ id: string }?]
  >`select id from users where email = ${email.toLowerCase()}`;
  if (!user) {
    const [invite] = await sql<[{ id: string }?]>`
      insert into staff_invites (event_id, email, role, invited_by)
      values (${eventId}, ${email.toLowerCase()}, ${role}, ${actorId})
      on conflict (event_id, email, role) do nothing
      returning id
    `;
    if (invite) {
      await audit(sql, {
        eventId,
        actorId,
        action: 'staff.invited',
        entityType: 'staff_invite',
        entityId: invite.id,
        after: { role },
      });
      // Agent rule 16: queued in this transaction. No user yet, so the address comes from the invite.
      await sql`
        insert into notification_outbox (user_id, channel, template, payload, dedupe_key)
        values (null, 'email', 'staff_invite',
                ${sql.json({ invite_id: invite.id, event_id: eventId })},
                ${`staff_invite:${invite.id}`})
      `;
    }
    return listStaffAndInvites(sql, eventId);
  }
  const inserted = await sql`
    insert into event_staff (event_id, user_id, role) values (${eventId}, ${user.id}, ${role})
    on conflict do nothing
    returning user_id
  `;
  if (inserted.length > 0) {
    await audit(sql, {
      eventId,
      actorId,
      action: 'staff.added',
      entityType: 'event_staff',
      entityId: user.id,
      after: { role },
    });
    await sql`
      insert into notification_outbox (user_id, channel, template, payload, dedupe_key)
      values (${user.id}, 'email', 'staff_added', ${sql.json({ event_id: eventId, role })},
              ${`staff_added:${eventId}:${user.id}:${role}:${Date.now()}`})
    `;
  }
  return listStaffAndInvites(sql, eventId);
}

/** DELETE /events/{id}/staff/invites/{inviteId}: withdraws an invitation. Audited. Run inside tx(). */
export async function cancelStaffInvite(
  sql: ISql,
  eventId: string,
  actorId: string,
  inviteId: string,
): Promise<StaffList> {
  const [removed] = await sql<[{ role: string }?]>`
    delete from staff_invites where id = ${inviteId} and event_id = ${eventId}
    returning role::text as role
  `;
  if (!removed) throw new ApiError('NOT_FOUND', 'That invitation was already used or withdrawn.');
  await audit(sql, {
    eventId,
    actorId,
    action: 'staff.invite_cancelled',
    entityType: 'staff_invite',
    entityId: inviteId,
    before: { role: removed.role },
  });
  return listStaffAndInvites(sql, eventId);
}

/** Removes one staff role. The last owner can't be removed. Run inside tx(). */
export async function removeStaff(
  sql: ISql,
  eventId: string,
  actorId: string,
  userId: string,
  role: StaffRole,
): Promise<StaffMember[]> {
  await lockEvent(sql, eventId);
  if (role === 'owner') {
    const [{ owners }] = await sql<[{ owners: number }]>`
      select count(*)::int as owners from event_staff where event_id = ${eventId} and role = 'owner'
    `;
    const isOwner = await sql`
      select 1 from event_staff where event_id = ${eventId} and user_id = ${userId} and role = 'owner'
    `;
    if (isOwner.length > 0 && owners <= 1) {
      throw new ApiError('LAST_OWNER', 'Every event needs an owner. Add another owner first.');
    }
  }
  const removed = await sql`
    delete from event_staff where event_id = ${eventId} and user_id = ${userId} and role = ${role}
    returning user_id
  `;
  if (removed.length > 0) {
    await audit(sql, {
      eventId,
      actorId,
      action: 'staff.removed',
      entityType: 'event_staff',
      entityId: userId,
      before: { role },
    });
  }
  return listStaff(sql, eventId);
}
