// R43 and R44: the platform admin area. Platform admins are a fixed list of at most two emails in
// the database; they manage organizers and have owner rights at every event (Q10). Everyone
// else gets 404 from the admin endpoints, signed in or not.
import { getSql } from '@hx/db';
import { adminPeopleSchema, CIREN_ORG_ID, eventSchema, fieldErrorsOf } from '@hx/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DELETE as removeOrganizer } from '@/app/api/v1/admin/organizers/[userId]/route';
import { GET as listPeople, POST as addOrganizer } from '@/app/api/v1/admin/organizers/route';
import { GET as getEvent } from '@/app/api/v1/events/[id]/route';
import { GET as listStaff } from '@/app/api/v1/events/[id]/staff/route';
import { POST as setStatus } from '@/app/api/v1/events/[id]/status/route';
import { POST as createEvent } from '@/app/api/v1/orgs/[orgId]/events/route';
import { call, expectError, fixtures } from './helpers';

const fx = fixtures();
const sql = getSql();

let admin: { id: string; email: string };
let other: { id: string; email: string };
let people: Awaited<ReturnType<typeof fx.eventWithRoles>>['people'];
let eventId: string;

const isAdmin = async (id: string) =>
  (await sql<[{ a: boolean }]>`select is_platform_admin as a from users where id = ${id}`)[0].a;

beforeAll(async () => {
  admin = await fx.user('Platform Admin');
  other = await fx.user('Someone');
  // The migration lists admin.cirenet@gmail.com; the tests add one more, the most there can be.
  await sql`insert into platform_admin_emails (email) values (${admin.email})`;
  const result = await fx.eventWithRoles({ status: 'draft' });
  people = result.people;
  eventId = result.event.id;
});

afterAll(async () => {
  await sql`delete from platform_admin_emails where email = ${admin.email}`;
  await fx.cleanup();
});

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

describe('who is a platform admin (R44)', () => {
  it('follows the fixed list: an account on it is an admin, nobody else', async () => {
    expect(await isAdmin(admin.id)).toBe(true);
    expect(await isAdmin(other.id)).toBe(false);
  });

  it('ignores setting the flag by hand', async () => {
    await sql`update users set is_platform_admin = true where id = ${other.id}`;
    expect(await isAdmin(other.id)).toBe(false);
    await sql`update users set is_platform_admin = false where id = ${admin.id}`;
    expect(await isAdmin(admin.id)).toBe(true);
  });

  it('allows at most two addresses on the list', async () => {
    const [{ n }] = await sql<
      [{ n: number }]
    >`select count(*)::int as n from platform_admin_emails`;
    expect(n).toBeLessThanOrEqual(2);
    if (n === 2) {
      await expect(
        sql`insert into platform_admin_emails (email) values (${other.email})`,
      ).rejects.toThrow(/at most two platform admins/);
    }
  });

  it('needs an email the provider confirmed', async () => {
    const unconfirmed = await fx.user('Unconfirmed');
    await sql`update auth.users set email_confirmed_at = null where id = ${unconfirmed.id}`;
    await sql`delete from platform_admin_emails where email = ${admin.email}`;
    await sql`insert into platform_admin_emails (email) values (${unconfirmed.email})`;
    expect(await isAdmin(unconfirmed.id)).toBe(false);
    await sql`delete from platform_admin_emails where email = ${unconfirmed.email}`;
    await sql`insert into platform_admin_emails (email) values (${admin.email})`;
    expect(await isAdmin(admin.id)).toBe(true);
  });
});

describe('who may use the admin endpoints', () => {
  it('answers 404 to anyone who is not a platform admin, signed in or not', async () => {
    await sql`insert into org_members (org_id, user_id) values (${CIREN_ORG_ID}, ${people.admin.id})`;
    for (const who of [people.owner.id, people.admin.id, people.participant.id, undefined]) {
      await expectError(await call(listPeople, { as: who }), 404, 'NOT_FOUND');
      await expectError(
        await call(addOrganizer, { method: 'POST', as: who, body: { email: other.email } }),
        404,
        'NOT_FOUND',
      );
      await expectError(
        await call(removeOrganizer, { method: 'DELETE', as: who, params: { userId: other.id } }),
        404,
        'NOT_FOUND',
      );
    }
    await sql`delete from org_members where user_id = ${people.admin.id}`;
  });

  it('lists the fixed admin list, read-only', async () => {
    const list = adminPeopleSchema.parse(await (await call(listPeople, { as: admin.id })).json());
    expect(list.admins).toEqual(
      expect.arrayContaining([
        { email: admin.email, id: admin.id, name: 'Platform Admin', active: true },
      ]),
    );
  });
});

describe('organizers', () => {
  it('adds an existing account by email, once, and audits it', async () => {
    const response = await call(addOrganizer, {
      method: 'POST',
      as: admin.id,
      body: { email: `  ${other.email.toUpperCase()} ` },
    });
    expect(response.status).toBe(200);
    const list = adminPeopleSchema.parse(await response.json());
    expect(list.organizers.map((p) => p.id)).toContain(other.id);

    const again = await call(addOrganizer, {
      method: 'POST',
      as: admin.id,
      body: { email: other.email },
    });
    expect(again.status).toBe(200);
    const audits = await sql`
      select 1 from audit_log
      where actor_id = ${admin.id} and action = 'org.member_added' and entity_id = ${other.id}
    `;
    expect(audits).toHaveLength(1);
  });

  it('lets the new organizer create a CIReN event', async () => {
    const response = await call(createEvent, {
      method: 'POST',
      as: other.id,
      params: { orgId: CIREN_ORG_ID },
      body: {
        name: 'Test Hackathon Admin',
        timezone: 'Africa/Accra',
        mode: 'in_person',
        starts_at: future(30),
        submission_deadline: future(31),
        ends_at: future(31.25),
      },
    });
    expect(response.status).toBe(201);
    fx.trackEvent(eventSchema.parse(await response.json()).id);
  });

  it('refuses an email nobody has signed in with', async () => {
    const body = await expectError(
      await call(addOrganizer, {
        method: 'POST',
        as: admin.id,
        body: { email: `nobody-${crypto.randomUUID()}@example.test` },
      }),
      404,
      'USER_NOT_FOUND',
    );
    expect(Object.keys(fieldErrorsOf(body.error.details))).toEqual(['email']);
  });

  it('removes an organizer, once', async () => {
    const response = await call(removeOrganizer, {
      method: 'DELETE',
      as: admin.id,
      params: { userId: other.id },
    });
    expect(response.status).toBe(200);
    const list = adminPeopleSchema.parse(await response.json());
    expect(list.organizers.map((p) => p.id)).not.toContain(other.id);
    await expectError(
      await call(removeOrganizer, { method: 'DELETE', as: admin.id, params: { userId: other.id } }),
      404,
      'NOT_FOUND',
    );
  });
});

describe('owner rights at every event (Q10)', () => {
  it('lets a platform admin see a draft, manage staff and change the status, without a role', async () => {
    expect((await call(getEvent, { as: admin.id, params: { id: eventId } })).status).toBe(200);
    expect((await call(listStaff, { as: admin.id, params: { id: eventId } })).status).toBe(200);
    const published = await call(setStatus, {
      method: 'POST',
      as: admin.id,
      params: { id: eventId },
      body: { status: 'published' },
    });
    expect(published.status).toBe(200);
    const [audit] = await sql<[{ actor_id: string }]>`
      select actor_id from audit_log
      where event_id = ${eventId} and action = 'event.status_changed'
    `;
    expect(audit.actor_id).toBe(admin.id);
    const staff = await sql`
      select 1 from event_staff where event_id = ${eventId} and user_id = ${admin.id}
    `;
    expect(staff).toHaveLength(0);
  });

  it('gives nothing extra to someone who is not a platform admin', async () => {
    const draft = await fx.event(people.owner.id, { status: 'draft' });
    await expectError(
      await call(getEvent, { as: other.id, params: { id: draft.id } }),
      404,
      'NOT_FOUND',
    );
    expect((await call(getEvent, { as: admin.id, params: { id: draft.id } })).status).toBe(200);
  });
});
