// Phase 2: events, status, staff, setup, and the permission matrix.
import { getSql } from '@hx/db';
import { CIREN_ORG_ID, eventSchema, fieldErrorsOf } from '@hx/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as createTrack } from '@/app/api/v1/events/[id]/tracks/route';
import { DELETE as deleteTrack } from '@/app/api/v1/events/[id]/tracks/[itemId]/route';
import { POST as createAward } from '@/app/api/v1/events/[id]/awards/route';
import { POST as createRubric } from '@/app/api/v1/events/[id]/rubric/route';
import { POST as createSchedule } from '@/app/api/v1/events/[id]/schedule/route';
import { GET as getEvent, PATCH as patchEvent } from '@/app/api/v1/events/[id]/route';
import { GET as getSetup } from '@/app/api/v1/events/[id]/setup/route';
import {
  DELETE as removeStaff,
  GET as listStaff,
  POST as addStaff,
} from '@/app/api/v1/events/[id]/staff/route';
import { POST as setStatus } from '@/app/api/v1/events/[id]/status/route';
import { GET as listEvents } from '@/app/api/v1/events/route';
import { POST as createEvent } from '@/app/api/v1/orgs/[orgId]/events/route';
import { call, expectError, expectServerTime, fixtures } from './helpers';

const fx = fixtures();
const sql = getSql();
afterAll(() => fx.cleanup());

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

const newEventBody = () => ({
  name: 'Test Hackathon Create',
  timezone: 'Africa/Accra',
  mode: 'in_person',
  starts_at: future(30),
  submission_deadline: future(31),
  ends_at: future(31.25),
});

describe('POST /orgs/{orgId}/events', () => {
  it('lets an org member create a draft they own, with a slug from the name', async () => {
    const member = await fx.user('Organizer');
    await sql`insert into org_members (org_id, user_id) values (${CIREN_ORG_ID}, ${member.id})`;

    const response = await call(createEvent, {
      method: 'POST',
      as: member.id,
      params: { orgId: CIREN_ORG_ID },
      body: newEventBody(),
    });
    expect(response.status).toBe(201);
    expectServerTime(response);
    const event = eventSchema.parse(await response.json());
    fx.trackEvent(event.id);
    expect(event).toMatchObject({
      status: 'draft',
      slug: expect.stringMatching(/^test-hackathon-create/),
    });

    const [staff] =
      await sql`select role::text from event_staff where event_id = ${event.id} and user_id = ${member.id}`;
    expect(staff?.role).toBe('owner');
  });

  it('refuses someone who is not an org member', async () => {
    const outsider = await fx.user('Outsider');
    await expectError(
      await call(createEvent, {
        method: 'POST',
        as: outsider.id,
        params: { orgId: CIREN_ORG_ID },
        body: newEventBody(),
      }),
      403,
      'FORBIDDEN',
    );
  });

  it('gives field errors for dates out of order', async () => {
    const member = await fx.user('Organizer 2');
    await sql`insert into org_members (org_id, user_id) values (${CIREN_ORG_ID}, ${member.id})`;
    const body = { ...newEventBody(), submission_deadline: future(29) };
    const error = await expectError(
      await call(createEvent, {
        method: 'POST',
        as: member.id,
        params: { orgId: CIREN_ORG_ID },
        body,
      }),
      400,
      'VALIDATION_FAILED',
    );
    expect(fieldErrorsOf(error.error.details)).toHaveProperty('submission_deadline');
  });
});

describe('event visibility', () => {
  let draftId: string;
  let ownerId: string;
  let participantId: string;

  beforeAll(async () => {
    const { event, people } = await fx.eventWithRoles({ status: 'draft' });
    draftId = event.id;
    ownerId = people.owner.id;
    participantId = people.participant.id;
  });

  it('shows a draft to its owner only', async () => {
    expect((await call(getEvent, { as: ownerId, params: { id: draftId } })).status).toBe(200);
    await expectError(await call(getEvent, { params: { id: draftId } }), 404, 'NOT_FOUND');
    await expectError(
      await call(getEvent, { as: participantId, params: { id: draftId } }),
      404,
      'NOT_FOUND',
    );
  });

  it('keeps drafts out of the public list', async () => {
    const list = (await (await call(listEvents)).json()) as { items: { id: string }[] };
    expect(list.items.map((e) => e.id)).not.toContain(draftId);
  });
});

describe('permission matrix: editing an event', () => {
  let eventId: string;
  let people: Awaited<ReturnType<typeof fx.eventWithRoles>>['people'];

  beforeAll(async () => {
    const result = await fx.eventWithRoles();
    eventId = result.event.id;
    people = result.people;
  });

  const patch = (as: string | undefined, body: unknown) =>
    call(patchEvent, { method: 'PATCH', as, params: { id: eventId }, body });

  it.each(['owner', 'admin'] as const)('%s can edit', async (role) => {
    const response = await patch(people[role].id, { description: `Edited by ${role}` });
    expect(response.status).toBe(200);
  });

  it.each(['judge', 'mentor', 'volunteer', 'participant'] as const)(
    '%s cannot edit',
    async (role) => {
      await expectError(await patch(people[role].id, { description: 'nope' }), 403, 'FORBIDDEN');
    },
  );

  it('refuses an anonymous edit', async () => {
    await expectError(await patch(undefined, { description: 'nope' }), 401, 'UNAUTHENTICATED');
  });

  it('audits edits with before and after', async () => {
    await patch(people.owner.id, { location: 'Hall B' });
    const [row] = await sql`
      select before, after from audit_log
      where event_id = ${eventId} and action = 'event.updated' order by id desc limit 1
    `;
    expect(row?.after).toEqual({ location: 'Hall B' });
  });

  it.each(['judge', 'mentor', 'volunteer', 'participant'] as const)(
    '%s cannot change the status',
    async (role) => {
      await expectError(
        await call(setStatus, {
          method: 'POST',
          as: people[role].id,
          params: { id: eventId },
          body: { status: 'live' },
        }),
        403,
        'FORBIDDEN',
      );
    },
  );
});

describe('POST /events/{id}/status', () => {
  it('publishes, goes live, refuses skipping ahead, and audits each change', async () => {
    const { event, people } = await fx.eventWithRoles({ status: 'draft' });
    const status = (to: string) =>
      call(setStatus, {
        method: 'POST',
        as: people.admin.id,
        params: { id: event.id },
        body: { status: to },
      });

    expect((await (await status('published')).json()).status).toBe('published');
    const skip = await expectError(await status('completed'), 409, 'INVALID_TRANSITION');
    expect(skip.error.details).toMatchObject({ from: 'published', to: 'completed' });
    expect((await (await status('live')).json()).status).toBe('live');
    await expectError(await status('judging'), 409, 'INVALID_TRANSITION');

    const audits = await sql<{ after: { status: string } }[]>`
      select after from audit_log where event_id = ${event.id} and action = 'event.status_changed' order by id
    `;
    expect(audits.map((a) => a.after.status)).toEqual(['published', 'live']);
  });
});

describe('staff', () => {
  let eventId: string;
  let people: Awaited<ReturnType<typeof fx.eventWithRoles>>['people'];

  beforeAll(async () => {
    const result = await fx.eventWithRoles();
    eventId = result.event.id;
    people = result.people;
  });

  it('lets the owner add someone who has signed in, by email', async () => {
    const response = await call(addStaff, {
      method: 'POST',
      as: people.owner.id,
      params: { id: eventId },
      body: { email: people.participant.email.toUpperCase(), role: 'judge' },
    });
    expect(response.status).toBe(200);
    const { items } = (await response.json()) as { items: { user_id: string; role: string }[] };
    expect(items).toContainEqual(
      expect.objectContaining({ user_id: people.participant.id, role: 'judge' }),
    );
  });

  it('returns USER_NOT_FOUND for someone who never signed in', async () => {
    const error = await expectError(
      await call(addStaff, {
        method: 'POST',
        as: people.owner.id,
        params: { id: eventId },
        body: { email: 'nobody-here@example.test', role: 'mentor' },
      }),
      404,
      'USER_NOT_FOUND',
    );
    expect(error.error.message).toMatch(/sign in/i);
  });

  it('refuses an admin (staff is owner-only)', async () => {
    await expectError(
      await call(listStaff, { as: people.admin.id, params: { id: eventId } }),
      403,
      'FORBIDDEN',
    );
  });

  it('never removes the last owner', async () => {
    await expectError(
      await call(removeStaff, {
        method: 'DELETE',
        as: people.owner.id,
        params: { id: eventId },
        body: { user_id: people.owner.id, role: 'owner' },
      }),
      409,
      'LAST_OWNER',
    );
  });

  it('removes a role and audits it', async () => {
    const response = await call(removeStaff, {
      method: 'DELETE',
      as: people.owner.id,
      params: { id: eventId },
      body: { user_id: people.mentor.id, role: 'mentor' },
    });
    expect(response.status).toBe(200);
    const audits =
      await sql`select 1 from audit_log where event_id = ${eventId} and action = 'staff.removed'`;
    expect(audits).toHaveLength(1);
  });
});

describe('setup: tracks, schedule, rubric, awards', () => {
  it('creates and lists items, checks award tracks, and audits deletes', async () => {
    const { event, people } = await fx.eventWithRoles();
    const other = await fx.event(people.owner.id);
    const as = people.admin.id;
    const params = { id: event.id };

    const track = (await (
      await call(createTrack, { method: 'POST', as, params, body: { name: 'Health' } })
    ).json()) as { id: string };
    const otherTrack = (await (
      await call(createTrack, {
        method: 'POST',
        as: people.owner.id,
        params: { id: other.id },
        body: { name: 'Elsewhere' },
      })
    ).json()) as { id: string };

    const badAward = await expectError(
      await call(createAward, {
        method: 'POST',
        as,
        params,
        body: { name: 'Best', track_id: otherTrack.id },
      }),
      400,
      'VALIDATION_FAILED',
    );
    expect(fieldErrorsOf(badAward.error.details)).toHaveProperty('track_id');

    expect(
      (
        await call(createAward, {
          method: 'POST',
          as,
          params,
          body: { name: 'Best health', track_id: track.id, rank: 1 },
        })
      ).status,
    ).toBe(201);
    await expectError(
      await call(deleteTrack, { method: 'DELETE', as, params: { id: event.id, itemId: track.id } }),
      409,
      'CONFLICT',
    );

    const scheduleBad = await expectError(
      await call(createSchedule, {
        method: 'POST',
        as,
        params,
        body: { title: 'Opening', starts_at: future(30), ends_at: future(29) },
      }),
      400,
      'VALIDATION_FAILED',
    );
    expect(fieldErrorsOf(scheduleBad.error.details)).toHaveProperty('ends_at');

    for (const name of ['Impact', 'Technical difficulty']) {
      await call(createRubric, {
        method: 'POST',
        as,
        params,
        body: { name, max_score: 10, is_tiebreaker: true },
      });
    }
    const setup = (await (await call(getSetup, { params })).json()) as {
      rubric: { name: string; is_tiebreaker: boolean; weight: number }[];
      tracks: unknown[];
      awards: unknown[];
    };
    expect(setup.tracks).toHaveLength(1);
    expect(setup.awards).toHaveLength(1);
    expect(setup.rubric.filter((c) => c.is_tiebreaker).map((c) => c.name)).toEqual([
      'Technical difficulty',
    ]);
    expect(setup.rubric[0]?.weight).toBe(1);

    const spare = (await (
      await call(createTrack, { method: 'POST', as, params, body: { name: 'Open' } })
    ).json()) as { id: string };
    const deleted = await call(deleteTrack, {
      method: 'DELETE',
      as,
      params: { id: event.id, itemId: spare.id },
    });
    expect(deleted.status).toBe(204);
    const audit =
      await sql`select before from audit_log where event_id = ${event.id} and action = 'track.deleted'`;
    expect(audit[0]?.before).toMatchObject({ name: 'Open' });
  });

  it.each(['judge', 'mentor', 'volunteer', 'participant'] as const)(
    '%s cannot add a track',
    async (role) => {
      const { event, people } = await fx.eventWithRoles();
      await expectError(
        await call(createTrack, {
          method: 'POST',
          as: people[role].id,
          params: { id: event.id },
          body: { name: 'Nope' },
        }),
        403,
        'FORBIDDEN',
      );
    },
  );
});
