// Helpers for integration tests. Never import from application code.
import { randomUUID } from 'node:crypto';
import type { ISql } from './client';

export interface TestUserOptions {
  name?: string;
  email?: string;
  provider?: 'google' | 'github';
  userName?: string;
}

/**
 * Insert an auth user the way Supabase Auth does after an OAuth sign-in, so the
 * on_auth_user_created trigger runs. Returns the new user's id and email.
 */
export async function createTestUser(
  sql: ISql,
  options: TestUserOptions = {},
): Promise<{ id: string; email: string }> {
  const id = randomUUID();
  const email = options.email ?? `test-${id}@example.test`;
  const meta: Record<string, string> = { full_name: options.name ?? 'Test User' };
  if (options.userName) meta.user_name = options.userName;

  await sql`
    insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
    values (
      ${id},
      ${email},
      ${sql.json(meta)},
      ${sql.json({ provider: options.provider ?? 'google' })}
    )
  `;
  return { id, email };
}

/**
 * Remove a test user and everything that points at them without a cascade:
 * their outbox rows, applications, decisions they made, and audit rows they wrote.
 */
export async function deleteTestUser(sql: ISql, id: string): Promise<void> {
  await sql`delete from notification_outbox where user_id = ${id}`;
  await sql`delete from team_drafts where updated_by = ${id}`;
  await sql`delete from staff_invites where invited_by = ${id}`;
  await sql`update applications set decided_by = null where decided_by = ${id}`;
  await sql`delete from check_ins where user_id = ${id} or checked_in_by = ${id}`;
  await sql`delete from team_members where user_id = ${id}`;
  await sql`delete from mentor_requests where requested_by = ${id} or claimed_by = ${id}`;
  await sql`delete from announcements where author_id = ${id}`;
  await sql`delete from scores where judge_id = ${id}`;
  await sql`delete from judge_assignments where judge_id = ${id}`;
  await sql`delete from submissions where team_id in (select id from teams where owner_id = ${id})`;
  await sql`delete from teams where owner_id = ${id}`;
  await sql`delete from applications where user_id = ${id}`;
  await sql`delete from audit_log where actor_id = ${id}`;
  await sql`delete from auth.users where id = ${id}`;
}

export interface TestEventOptions {
  status?: 'draft' | 'published' | 'live' | 'judging' | 'completed';
  /** Applications open: true (default) puts now inside the window, false puts it after. */
  applicationsOpen?: boolean;
  questions?: unknown[];
  name?: string;
}

/**
 * Insert an event directly (bypassing the API) with `ownerId` as owner. By default it is
 * published, applications are open now, and the event starts in a week.
 */
export async function createTestEvent(
  sql: ISql,
  ownerId: string,
  options: TestEventOptions = {},
): Promise<{ id: string; slug: string }> {
  const id = randomUUID();
  const slug = `test-${id}`;
  const open = options.applicationsOpen ?? true;
  await sql`
    insert into events (
      id, organization_id, name, slug, timezone, mode, status,
      applications_open_at, applications_close_at,
      starts_at, submission_deadline, ends_at, application_questions
    ) values (
      ${id}, '00000000-0000-4000-8000-00000000c12e', ${options.name ?? 'Test Hackathon'}, ${slug},
      'Africa/Accra', 'in_person', ${options.status ?? 'published'},
      now() - interval '10 days',
      ${open ? sql`now() + interval '5 days'` : sql`now() - interval '1 day'`},
      now() + interval '7 days', now() + interval '8 days', now() + interval '8 days 6 hours',
      ${sql.json((options.questions ?? []) as never)}
    )
  `;
  await sql`insert into event_staff (event_id, user_id, role) values (${id}, ${ownerId}, 'owner')`;
  return { id, slug };
}

/** Remove a test event and every row that belongs to it. */
export async function deleteTestEvent(sql: ISql, id: string): Promise<void> {
  await sql`delete from notification_outbox where payload->>'event_id' = ${id}`;
  await sql`delete from check_ins where event_id = ${id}`;
  await sql`delete from mentor_requests where event_id = ${id}`;
  await sql`delete from announcements where event_id = ${id}`;
  await sql`delete from scores where submission_id in (select id from submissions where event_id = ${id})`;
  await sql`delete from judge_assignments where event_id = ${id}`;
  await sql`delete from award_winners where award_id in (select id from awards where event_id = ${id})`;
  await sql`delete from submissions where event_id = ${id}`;
  await sql`delete from teams where event_id = ${id}`;
  await sql`delete from audit_log where event_id = ${id}`;
  await sql`delete from applications where event_id = ${id}`;
  await sql`delete from awards where event_id = ${id}`;
  await sql`delete from events where id = ${id}`;
}

/** An application already accepted and confirmed, with a ticket code: a ready participant. */
export async function confirmApplicant(
  sql: ISql,
  eventId: string,
  userId: string,
): Promise<string> {
  const ticket = `tkt-${randomUUID()}`;
  await sql`
    insert into applications (event_id, user_id, status, ticket_code)
    values (${eventId}, ${userId}, 'confirmed', ${ticket})
  `;
  return ticket;
}

/** Tracks what a test file creates and removes it all afterwards: events first, then users. */
export function testData(sql: ISql) {
  const users: string[] = [];
  const events: string[] = [];
  const subscribers: string[] = [];
  return {
    /** An event alert subscriber (R42), with a unique address unless one is given. */
    async alertSubscriber(email = `alert-${randomUUID()}@example.test`) {
      const [row] = await sql<[{ id: string; email: string; unsubscribe_token: string }]>`
        insert into alert_subscribers (email) values (${email})
        on conflict (email) do update set unsubscribed_at = null
        returning id, email, unsubscribe_token
      `;
      subscribers.push(row.id);
      return row;
    },
    async user(name = 'Test User', options: TestUserOptions = {}) {
      const user = await createTestUser(sql, { name, ...options });
      users.push(user.id);
      return user;
    },
    async event(ownerId: string, options: TestEventOptions = {}) {
      const event = await createTestEvent(sql, ownerId, options);
      events.push(event.id);
      return event;
    },
    /** Track an event created some other way (e.g. through the API). */
    trackEvent(id: string) {
      events.push(id);
    },
    async staff(
      eventId: string,
      userId: string,
      role: 'owner' | 'admin' | 'judge' | 'mentor' | 'volunteer',
    ) {
      await sql`insert into event_staff (event_id, user_id, role) values (${eventId}, ${userId}, ${role})`;
    },
    async cleanup() {
      for (const id of subscribers.splice(0)) {
        await sql`delete from notification_outbox where payload->>'subscriber_id' = ${id}`;
        await sql`delete from alert_subscribers where id = ${id}`;
      }
      for (const id of events.splice(0)) await deleteTestEvent(sql, id);
      for (const id of users.splice(0)) await deleteTestUser(sql, id);
    },
  };
}
