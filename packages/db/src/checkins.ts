import {
  ApiError,
  type Attendee,
  type CheckInResult,
  type CheckInStats,
  type Ticket,
} from '@hx/shared';
import { audit } from './audit';
import { broadcastStaffCounts } from './live';
import type { ISql } from './client';
import { containsPattern, iso } from './rows';

/** GET /events/{id}/me/ticket: only for confirmed applicants (DESIGN Step 4). */
export async function getTicket(sql: ISql, eventId: string, userId: string): Promise<Ticket> {
  const [row] = await sql<
    [
      {
        status: string;
        ticket_code: string | null;
        event_name: string;
        name: string;
        checked_in_at: Date | null;
      }?,
    ]
  >`
    select a.status, a.ticket_code, e.name as event_name, u.name, c.created_at as checked_in_at
    from applications a
    join events e on e.id = a.event_id
    join users u on u.id = a.user_id
    left join check_ins c on c.event_id = a.event_id and c.user_id = a.user_id
    where a.event_id = ${eventId} and a.user_id = ${userId}
  `;
  if (!row || row.status !== 'confirmed' || !row.ticket_code) {
    throw new ApiError('NOT_CONFIRMED', 'Your ticket appears once you confirm your place.');
  }
  return {
    ticket_code: row.ticket_code,
    event_id: eventId,
    event_name: row.event_name,
    name: row.name,
    checked_in_at: iso(row.checked_in_at),
  };
}

/** Check-in is open while the event is published or live. */
async function assertCheckInOpen(sql: ISql, eventId: string): Promise<void> {
  const [event] = await sql<[{ status: string }?]>`
    select status from events where id = ${eventId} and deleted_at is null
  `;
  if (!event || (event.status !== 'published' && event.status !== 'live')) {
    throw new ApiError('CONFLICT', 'Check-in is closed for this event.');
  }
}

/**
 * POST /events/{id}/check-ins: a volunteer scans a QR ticket. A second scan returns
 * ALREADY_CHECKED_IN with the first time, so a forwarded QR shows up at the door.
 */
export async function checkInByTicket(
  sql: ISql,
  eventId: string,
  staffId: string,
  ticketCode: string,
): Promise<CheckInResult> {
  await assertCheckInOpen(sql, eventId);
  const [ticket] = await sql<[{ user_id: string; status: string }?]>`
    select user_id, status from applications
    where event_id = ${eventId} and ticket_code = ${ticketCode}
  `;
  if (!ticket) throw new ApiError('TICKET_NOT_FOUND', 'This ticket is not for this event.');
  if (ticket.status !== 'confirmed') {
    throw new ApiError('TICKET_CANCELLED', 'This person gave up their place.');
  }
  return insertCheckIn(sql, eventId, ticket.user_id, staffId, 'scan');
}

/** POST /events/{id}/check-ins/manual: owner or admin, by person, audited. */
export async function manualCheckIn(
  sql: ISql,
  eventId: string,
  staffId: string,
  userId: string,
): Promise<CheckInResult> {
  await assertCheckInOpen(sql, eventId);
  const [application] = await sql<[{ status: string }?]>`
    select status from applications where event_id = ${eventId} and user_id = ${userId}
  `;
  if (application?.status !== 'confirmed') {
    throw new ApiError('NOT_CONFIRMED', 'Only people who confirmed their place can check in.');
  }
  const result = await insertCheckIn(sql, eventId, userId, staffId, 'manual');
  await audit(sql, {
    eventId,
    actorId: staffId,
    action: 'check_in.manual',
    entityType: 'check_in',
    entityId: userId,
    after: { user_id: userId },
  });
  return result;
}

async function insertCheckIn(
  sql: ISql,
  eventId: string,
  userId: string,
  staffId: string,
  method: 'scan' | 'manual',
): Promise<CheckInResult> {
  const inserted = await sql`
    insert into check_ins (event_id, user_id, checked_in_by, method)
    values (${eventId}, ${userId}, ${staffId}, ${method})
    on conflict (event_id, user_id) do nothing
    returning id
  `;
  const result = await describeCheckIn(sql, eventId, userId);
  if (inserted.length === 0) {
    throw new ApiError('ALREADY_CHECKED_IN', `${result.name} is already checked in.`, {
      checked_in_at: result.checked_in_at,
      name: result.name,
      method: result.method,
    });
  }
  await broadcastStaffCounts(sql, eventId);
  return result;
}

async function describeCheckIn(sql: ISql, eventId: string, userId: string): Promise<CheckInResult> {
  const [row] = await sql<
    [
      {
        user_id: string;
        name: string;
        school: string | null;
        team_name: string | null;
        created_at: Date;
        method: 'scan' | 'manual';
      },
    ]
  >`
    select c.user_id, u.name, p.school, t.name as team_name, c.created_at, c.method
    from check_ins c
    join users u on u.id = c.user_id
    join profiles p on p.user_id = c.user_id
    left join team_members m on m.event_id = c.event_id and m.user_id = c.user_id
    left join teams t on t.id = m.team_id and t.deleted_at is null
    where c.event_id = ${eventId} and c.user_id = ${userId}
  `;
  return {
    user_id: row.user_id,
    name: row.name,
    school: row.school,
    team_name: row.team_name,
    checked_in_at: iso(row.created_at),
    method: row.method,
  };
}

/** GET /events/{id}/check-ins/stats */
export async function checkInStats(sql: ISql, eventId: string): Promise<CheckInStats> {
  const [row] = await sql<[CheckInStats]>`
    select
      (select count(*)::int from applications where event_id = ${eventId} and status = 'confirmed')
        as confirmed,
      (select count(*)::int from check_ins where event_id = ${eventId}) as checked_in
  `;
  return row;
}

/** GET /events/{id}/check-ins/search?q=: confirmed attendees by name or email (manual check-in). */
export async function searchAttendees(sql: ISql, eventId: string, q: string): Promise<Attendee[]> {
  const pattern = containsPattern(q);
  const rows = await sql<
    {
      user_id: string;
      name: string;
      email: string;
      school: string | null;
      checked_in_at: Date | null;
    }[]
  >`
    select a.user_id, u.name, u.email, p.school, c.created_at as checked_in_at
    from applications a
    join users u on u.id = a.user_id
    join profiles p on p.user_id = a.user_id
    left join check_ins c on c.event_id = a.event_id and c.user_id = a.user_id
    where a.event_id = ${eventId} and a.status = 'confirmed'
      and (u.name ilike ${pattern} or u.email ilike ${pattern})
    order by u.name
    limit 20
  `;
  return rows.map((row) => ({ ...row, checked_in_at: iso(row.checked_in_at) }));
}
