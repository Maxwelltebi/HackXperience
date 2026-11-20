// Phase 2: applying, the review list, bulk decisions and RSVP.
import { getSql } from '@hx/db';
import {
  applicationListResponseSchema,
  fieldErrorsOf,
  myApplicationSchema,
  type ApplicationQuestion,
} from '@hx/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as decide } from '@/app/api/v1/events/[id]/applications/decisions/route';
import { GET as myApplication } from '@/app/api/v1/events/[id]/applications/me/route';
import { POST as rsvp } from '@/app/api/v1/events/[id]/applications/me/rsvp/route';
import {
  GET as listApplications,
  POST as apply,
} from '@/app/api/v1/events/[id]/applications/route';
import { call, expectError, fixtures } from './helpers';

const fx = fixtures();
const sql = getSql();
afterAll(() => fx.cleanup());

const questions: ApplicationQuestion[] = [
  { id: 'why', type: 'long_text', label: 'Why do you want to attend?', required: true },
  { id: 'github', type: 'url', label: 'GitHub profile', required: false },
  {
    id: 'track',
    type: 'single_choice',
    label: 'Track interest',
    required: true,
    options: ['Health', 'FinTech'],
  },
];
const goodAnswers = { why: 'I build tools for my hall clinic.', track: 'Health' };

describe('POST /events/{id}/applications', () => {
  let eventId: string;
  let people: Awaited<ReturnType<typeof fx.eventWithRoles>>['people'];

  beforeAll(async () => {
    const result = await fx.eventWithRoles({ questions });
    eventId = result.event.id;
    people = result.people;
  });

  const applyAs = (as: string, answers: unknown) =>
    call(apply, { method: 'POST', as, params: { id: eventId }, body: { answers } });

  it('accepts a valid application while open, and a retry returns the same one', async () => {
    const first = await applyAs(people.participant.id, goodAnswers);
    expect(first.status).toBe(201);
    const created = myApplicationSchema.parse(await first.json());
    expect(created).toMatchObject({ status: 'submitted', ticket_code: null, answers: goodAnswers });

    const retry = await applyAs(people.participant.id, { ...goodAnswers, why: 'different' });
    expect(retry.status).toBe(200);
    expect(myApplicationSchema.parse(await retry.json()).id).toBe(created.id);

    const mine = await call(myApplication, { as: people.participant.id, params: { id: eventId } });
    expect(myApplicationSchema.parse(await mine.json()).id).toBe(created.id);
  });

  it('validates answers: missing required, wrong option, bad URL', async () => {
    const applicant = await fx.user('Applicant');
    const error = await expectError(
      await applyAs(applicant.id, { track: 'Space', github: 'github.com/me' }),
      400,
      'VALIDATION_FAILED',
    );
    expect(Object.keys(fieldErrorsOf(error.error.details)).sort()).toEqual([
      'answers.github',
      'answers.track',
      'answers.why',
    ]);
  });

  it('refuses applications once the window has closed', async () => {
    const owner = await fx.user('Closed owner');
    const closed = await fx.event(owner.id, { applicationsOpen: false });
    const applicant = await fx.user('Late applicant');
    await expectError(
      await call(apply, {
        method: 'POST',
        as: applicant.id,
        params: { id: closed.id },
        body: { answers: {} },
      }),
      423,
      'APPLICATIONS_CLOSED',
    );
  });

  it('refuses anonymous applications and hides drafts', async () => {
    await expectError(
      await call(apply, {
        method: 'POST',
        params: { id: eventId },
        body: { answers: goodAnswers },
      }),
      401,
      'UNAUTHENTICATED',
    );
    const owner = await fx.user('Draft owner');
    const draft = await fx.event(owner.id, { status: 'draft' });
    await expectError(
      await call(apply, {
        method: 'POST',
        as: people.participant.id,
        params: { id: draft.id },
        body: { answers: {} },
      }),
      404,
      'NOT_FOUND',
    );
  });

  it('returns 404 from /applications/me before applying', async () => {
    const stranger = await fx.user('Stranger');
    await expectError(
      await call(myApplication, { as: stranger.id, params: { id: eventId } }),
      404,
      'NOT_FOUND',
    );
  });
});

describe('organizer review', () => {
  let eventId: string;
  let people: Awaited<ReturnType<typeof fx.eventWithRoles>>['people'];
  const applicationIds: string[] = [];

  beforeAll(async () => {
    const result = await fx.eventWithRoles({ questions });
    eventId = result.event.id;
    people = result.people;
    for (const name of ['Ama Mensah', 'Efua Owusu', 'Kwame Boateng']) {
      const user = await fx.user(name);
      const response = await call(apply, {
        method: 'POST',
        as: user.id,
        params: { id: eventId },
        body: { answers: goodAnswers },
      });
      applicationIds.push(myApplicationSchema.parse(await response.json()).id);
    }
  });

  const list = (as: string, path = '') =>
    call(listApplications, { as, params: { id: eventId }, path: `/x${path}` });

  it.each(['owner', 'admin'] as const)('%s can list applications with counts', async (role) => {
    const response = await list(people[role].id);
    expect(response.status).toBe(200);
    const body = applicationListResponseSchema.parse(await response.json());
    expect(body.items).toHaveLength(3);
    expect(body.counts).toMatchObject({ all: 3, submitted: 3 });
  });

  it.each(['volunteer', 'judge', 'mentor', 'participant'] as const)(
    '%s cannot list applications',
    async (role) => {
      await expectError(await list(people[role].id), 403, 'FORBIDDEN');
    },
  );

  it('pages with a cursor and searches by name', async () => {
    const first = applicationListResponseSchema.parse(
      await (await list(people.owner.id, '?limit=2')).json(),
    );
    expect(first.items).toHaveLength(2);
    expect(first.next_cursor).not.toBeNull();
    const second = applicationListResponseSchema.parse(
      await (await list(people.owner.id, `?limit=2&cursor=${first.next_cursor}`)).json(),
    );
    expect(second.items).toHaveLength(1);
    expect(second.next_cursor).toBeNull();
    expect(new Set([...first.items, ...second.items].map((i) => i.id)).size).toBe(3);

    const search = applicationListResponseSchema.parse(
      await (await list(people.owner.id, '?q=efua')).json(),
    );
    expect(search.items.map((i) => i.name)).toEqual(['Efua Owusu']);
  });

  it('rejects a broken cursor', async () => {
    await expectError(await list(people.owner.id, '?cursor=garbage'), 400, 'VALIDATION_FAILED');
  });

  it.each(['volunteer', 'judge', 'mentor', 'participant'] as const)(
    '%s cannot decide',
    async (role) => {
      await expectError(
        await call(decide, {
          method: 'POST',
          as: people[role].id,
          params: { id: eventId },
          body: { application_ids: applicationIds, status: 'accepted' },
        }),
        403,
        'FORBIDDEN',
      );
    },
  );

  it('decides in bulk and filters by status', async () => {
    const response = await call(decide, {
      method: 'POST',
      as: people.admin.id,
      params: { id: eventId },
      body: { application_ids: applicationIds.slice(0, 2), status: 'accepted' },
    });
    expect(response.status).toBe(200);
    expect((await response.json()).updated).toHaveLength(2);
    const accepted = applicationListResponseSchema.parse(
      await (await list(people.owner.id, '?status=accepted')).json(),
    );
    expect(accepted.items).toHaveLength(2);
    expect(accepted.counts).toMatchObject({ accepted: 2, submitted: 1 });
  });
});

describe('RSVP', () => {
  it('confirms with a ticket code, then can decline; organizers can no longer change it', async () => {
    const { event, people } = await fx.eventWithRoles({ questions });
    const params = { id: event.id };
    const applied = myApplicationSchema.parse(
      await (
        await call(apply, {
          method: 'POST',
          as: people.participant.id,
          params,
          body: { answers: goodAnswers },
        })
      ).json(),
    );

    await expectError(
      await call(rsvp, {
        method: 'POST',
        as: people.participant.id,
        params,
        body: { response: 'confirm' },
      }),
      409,
      'INVALID_TRANSITION',
    );

    await call(decide, {
      method: 'POST',
      as: people.owner.id,
      params,
      body: { application_ids: [applied.id], status: 'accepted' },
    });
    const confirmed = myApplicationSchema.parse(
      await (
        await call(rsvp, {
          method: 'POST',
          as: people.participant.id,
          params,
          body: { response: 'confirm' },
        })
      ).json(),
    );
    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.ticket_code).toMatch(/^[A-Za-z0-9_-]{16,}$/);

    const later = await call(decide, {
      method: 'POST',
      as: people.owner.id,
      params,
      body: { application_ids: [applied.id], status: 'rejected' },
    });
    expect((await later.json()).skipped).toEqual([{ id: applied.id, reason: expect.any(String) }]);

    const declined = myApplicationSchema.parse(
      await (
        await call(rsvp, {
          method: 'POST',
          as: people.participant.id,
          params,
          body: { response: 'decline' },
        })
      ).json(),
    );
    expect(declined.status).toBe('declined');

    const audits =
      await sql`select 1 from audit_log where entity_id = ${applied.id} and action = 'application.rsvp'`;
    expect(audits).toHaveLength(2);
  });
});
