// Database set-up for the end-to-end journey, against the dev project's DATABASE_URL.
//
// The browser does everything a person would do. The database is used only for what a person
// can't do quickly: preparing the event (rubric, award, judge), letting the submission deadline
// pass without waiting, and cleaning up.
import { getSql } from '@hx/db';
import { createTestEvent, deleteTestEvent } from '@hx/db/testing';
import { emailFor, type Role } from './env';

export const E2E_EVENT_PREFIX = 'E2E Hackathon';

export interface JourneyEvent {
  id: string;
  slug: string;
  name: string;
  awardName: string;
}

export async function userId(role: Role): Promise<string> {
  const sql = getSql();
  const [row] = await sql<[{ id: string }?]>`select id from users where email = ${emailFor(role)}`;
  if (!row) throw new Error(`No ${role} test account: run the suite's global setup first.`);
  return row.id;
}

/**
 * A published event with applications open: two-person teams, a two-criterion rubric, one
 * overall award, and the judge account on staff. The organizer account owns it.
 */
export async function createJourneyEvent(): Promise<JourneyEvent> {
  const sql = getSql();
  await removeOldJourneyEvents();
  const [organizer, judge] = await Promise.all([userId('organizer'), userId('judge')]);
  const name = `${E2E_EVENT_PREFIX} ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
  const { id, slug } = await createTestEvent(sql, organizer, { name });
  const awardName = 'Best overall';
  await sql`update events set team_size_min = 2, team_size_max = 3 where id = ${id}`;
  await sql`
    insert into rubric_criteria (event_id, name, max_score, weight, position, is_tiebreaker)
    values (${id}, 'Impact', 10, 2, 0, false), (${id}, 'Execution', 10, 1, 1, true)
  `;
  await sql`insert into awards (event_id, name, rank) values (${id}, ${awardName}, 1)`;
  await sql`insert into event_staff (event_id, user_id, role) values (${id}, ${judge}, 'judge')`;
  return { id, slug, name, awardName };
}

/** Moves the submission deadline into the past, as if the hackathon's last hours went by. */
export async function passSubmissionDeadline(eventId: string): Promise<void> {
  await getSql()`
    update events
    set starts_at = now() - interval '2 hours', submission_deadline = now() - interval '1 minute'
    where id = ${eventId}
  `;
}

export async function teamId(eventId: string, name: string): Promise<string> {
  const [row] = await getSql()<[{ id: string }?]>`
    select id from teams where event_id = ${eventId} and name = ${name} and deleted_at is null
  `;
  if (!row) throw new Error(`No team "${name}" at the event.`);
  return row.id;
}

export async function deleteJourneyEvent(eventId: string): Promise<void> {
  await deleteTestEvent(getSql(), eventId);
}

/** Events left behind by an interrupted run. */
async function removeOldJourneyEvents(): Promise<void> {
  const sql = getSql();
  const old = await sql<{ id: string }[]>`
    select id from events where slug like 'test-%' and name like ${`${E2E_EVENT_PREFIX} %`}
  `;
  for (const { id } of old) await deleteTestEvent(sql, id);
}
