// Impact reports and soft delete (build plan Phase 7) against hand-counted fixtures.
import { randomUUID } from 'node:crypto';
import { ApiError, CIREN_ORG_ID } from '@hx/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeSql, getSql, tx } from './client';
import {
  deleteEvent,
  listDeletedEvents,
  listTeamsForOrganizer,
  restoreEvent,
  setDeleted,
} from './deletion';
import { getEventBySlug } from './events';
import { listGallery } from './judging';
import { eventImpact, eventImpactCsv, orgImpact } from './reports';
import { testData } from './testing';

const sql = getSql();
const data = testData(sql);
afterAll(async () => {
  await data.cleanup();
  await closeSql();
});

async function outcome(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'ok';
  } catch (error) {
    if (error instanceof ApiError) return error.code;
    throw error;
  }
}

/** Puts an event in March 2031, so the org report's date range holds only this file's events. */
async function moveTo2031(eventId: string, day: number) {
  await sql`
    update events set starts_at = ${`2031-03-${String(day).padStart(2, '0')}T09:00:00Z`},
                      submission_deadline = ${`2031-03-${String(day + 1).padStart(2, '0')}T09:00:00Z`},
                      ends_at = ${`2031-03-${String(day + 1).padStart(2, '0')}T18:00:00Z`},
                      applications_close_at = ${`2031-03-${String(day - 1).padStart(2, '0')}T09:00:00Z`}
    where id = ${eventId}
  `;
}

async function team(
  eventId: string,
  ownerId: string,
  name: string,
  submission: 'submitted' | 'draft' | null,
) {
  const teamId = randomUUID();
  await sql`insert into teams (id, event_id, name, invite_code, owner_id) values (${teamId}, ${eventId}, ${name}, ${randomUUID().slice(0, 8).toUpperCase()}, ${ownerId})`;
  await sql`insert into team_members (team_id, event_id, user_id) values (${teamId}, ${eventId}, ${ownerId})`;
  let submissionId: string | null = null;
  if (submission) {
    const [s] = await sql<[{ id: string }]>`
      insert into submissions (event_id, team_id, title, write_up, status)
      values (${eventId}, ${teamId}, ${name}, 'x', ${submission}) returning id
    `;
    submissionId = s.id;
  }
  return { teamId, submissionId };
}

let eventId: string;
let slug: string;
let ownerId: string;
let people: Record<'a' | 'b' | 'c' | 'd' | 'e', string>;
let deletedTeam: { teamId: string; submissionId: string | null };

beforeAll(async () => {
  const owner = await data.user('Owner');
  ownerId = owner.id;
  const event = await data.event(owner.id);
  eventId = event.id;
  slug = event.slug;
  await moveTo2031(eventId, 10);
  people = { a: '', b: '', c: '', d: '', e: '' };
  const statuses = {
    a: 'confirmed',
    b: 'confirmed',
    c: 'declined',
    d: 'rejected',
    e: 'submitted',
  } as const;
  for (const key of Object.keys(people) as (keyof typeof people)[]) {
    const user = await data.user(`Person ${key}`);
    people[key] = user.id;
    await sql`insert into applications (event_id, user_id, status, ticket_code)
              values (${eventId}, ${user.id}, ${statuses[key]}, ${statuses[key] === 'confirmed' ? `t-${user.id}` : null})`;
  }
  await sql`update profiles set school = 'KNUST', level_of_study = 'Undergraduate', country = 'Ghana', gender = 'Female' where user_id = ${people.a}`;
  await sql`update profiles set school = '  ', level_of_study = 'Graduate', country = 'Ghana', gender = null where user_id = ${people.b}`;
  for (const who of [people.a, people.b]) {
    await sql`insert into check_ins (event_id, user_id, checked_in_by, method) values (${eventId}, ${who}, ${owner.id}, 'manual')`;
  }
  const first = await team(eventId, people.a, 'Alpha', 'submitted');
  await team(eventId, people.b, 'Beta', 'draft');
  deletedTeam = await team(eventId, people.c, 'Gone', 'submitted');
  await sql`update teams set deleted_at = now() where id = ${deletedTeam.teamId}`;
  // Two mentor requests, claimed after 10 and 20 minutes; the second resolved.
  for (const [minutes, status] of [
    [10, 'claimed'],
    [20, 'resolved'],
  ] as const) {
    await sql`
      insert into mentor_requests (id, event_id, team_id, requested_by, topic, status, claimed_by, created_at, claimed_at)
      values (${randomUUID()}, ${eventId}, ${first.teamId}, ${people.a}, 'Help', ${status}, ${owner.id},
              now() - interval '1 hour', now() - interval '1 hour' + make_interval(mins => ${minutes}))
    `;
  }
}, 60_000);

describe('event impact report', () => {
  it('matches the hand count', async () => {
    const report = await eventImpact(sql, eventId);
    expect(report).toMatchObject({
      applicants: 5,
      accepted: 3, // a, b confirmed + c declined
      confirmed: 2,
      checked_in: 2,
      teams: 2, // the deleted team doesn't count
      submissions: 1,
      completion_rate: 0.5,
      mentor_requests: 2,
      mentor_resolved: 1,
      median_response_minutes: 15,
    });
    expect(report.demographics.school).toEqual([
      { value: 'KNUST', count: 1 },
      { value: 'Not given', count: 1 },
    ]);
    expect(report.demographics.country).toEqual([{ value: 'Ghana', count: 2 }]);
    expect(report.demographics.gender).toEqual([
      { value: 'Female', count: 1 },
      { value: 'Not given', count: 1 },
    ]);
    const csv = eventImpactCsv(report);
    expect(csv).toContain('Test Hackathon,overview,applicants,5\r\n');
    expect(csv).toContain('Test Hackathon,school,KNUST,1\r\n');
  });

  it('counts returning participants across an organization range', async () => {
    const second = await data.event(ownerId);
    await moveTo2031(second.id, 20);
    await sql`insert into applications (event_id, user_id, status, ticket_code) values (${second.id}, ${people.a}, 'confirmed', ${`t2-${people.a}`})`;
    await sql`insert into check_ins (event_id, user_id, checked_in_by, method) values (${second.id}, ${people.a}, ${ownerId}, 'scan')`;
    const report = await orgImpact(sql, CIREN_ORG_ID, { from: '2031-03-01', to: '2031-03-31' });
    expect(report.events.map((e) => e.event_id)).toEqual([eventId, second.id]);
    expect(report.totals).toMatchObject({ applicants: 6, checked_in: 3 });
    expect(report.returning_participants).toBe(1);
    const narrow = await orgImpact(sql, CIREN_ORG_ID, { from: '2031-03-15', to: '2031-03-31' });
    expect(narrow.events.map((e) => e.event_id)).toEqual([second.id]);
  });
});

describe('soft delete and restore', () => {
  it('hides a deleted team and project everywhere, and restore brings them back', async () => {
    const before = await listGallery(sql, eventId, { limit: 50 });
    expect(before.items.map((i) => i.title)).toEqual(['Alpha']);

    await tx((t) => setDeleted(t, 'team', eventId, deletedTeam.teamId, ownerId, false));
    const restored = await listGallery(sql, eventId, { limit: 50 });
    expect(restored.items.map((i) => i.title).sort()).toEqual(['Alpha', 'Gone']);
    expect((await eventImpact(sql, eventId)).teams).toBe(3);

    await tx((t) =>
      setDeleted(t, 'submission', eventId, deletedTeam.submissionId ?? '', ownerId, true),
    );
    expect((await listGallery(sql, eventId, { limit: 50 })).items.map((i) => i.title)).toEqual([
      'Alpha',
    ]);
    const teams = await listTeamsForOrganizer(sql, eventId);
    expect(teams.find((t) => t.name === 'Gone')?.submission?.deleted_at).not.toBeNull();

    expect(
      await outcome(() =>
        tx((t) =>
          setDeleted(t, 'submission', eventId, deletedTeam.submissionId ?? '', ownerId, true),
        ),
      ),
    ).toBe('NOT_FOUND');
    const audits = await sql<{ action: string }[]>`
      select action from audit_log where event_id = ${eventId} and action in ('team.restored', 'submission.deleted')
    `;
    expect(audits.map((a) => a.action).sort()).toEqual(['submission.deleted', 'team.restored']);
  });

  it('lets only the owner delete and restore an event', async () => {
    const stranger = await data.user('Stranger');
    expect(await outcome(() => tx((t) => deleteEvent(t, eventId, stranger.id)))).toBe('NOT_FOUND');
    await tx((t) => deleteEvent(t, eventId, ownerId));
    expect(await getEventBySlug(sql, slug)).toBeNull();
    expect((await listDeletedEvents(sql, ownerId)).map((e) => e.id)).toContain(eventId);
    expect(await outcome(() => tx((t) => restoreEvent(t, eventId, stranger.id)))).toBe('NOT_FOUND');
    await tx((t) => restoreEvent(t, eventId, ownerId));
    expect((await getEventBySlug(sql, slug))?.id).toBe(eventId);
  });
});
