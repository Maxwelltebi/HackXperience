// Phase 4: submissions through the API (status codes, If-Match, roles that must be refused).
import { createTeam, getSql, tx } from '@hx/db';
import { confirmApplicant } from '@hx/db/testing';
import { submissionSchema } from '@hx/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as reopen } from '@/app/api/v1/events/[id]/submissions/reopen/route';
import {
  GET as getSubmission,
  PUT as putSubmission,
} from '@/app/api/v1/events/[id]/teams/me/submission/route';
import { POST as submit } from '@/app/api/v1/events/[id]/teams/me/submission/submit/route';
import { call, expectError, expectServerTime, fixtures } from './helpers';

const fx = fixtures();
const sql = getSql();
afterAll(() => fx.cleanup());

let eventId: string;
let people: Awaited<ReturnType<typeof fx.eventWithRoles>>['people'];

beforeAll(async () => {
  const result = await fx.eventWithRoles();
  eventId = result.event.id;
  people = result.people;
  await confirmApplicant(sql, eventId, people.participant.id);
  await tx((t) => createTeam(t, eventId, people.participant.id, crypto.randomUUID(), 'ClinicQ'));
});

const put = (as: string, body: unknown, version?: string) =>
  call(putSubmission, {
    method: 'PUT',
    as,
    params: { id: eventId },
    body,
    headers: version === undefined ? {} : { 'if-match': version },
  });

describe('GET and PUT /events/{id}/teams/me/submission', () => {
  it('returns a blank draft at version 0 to a member', async () => {
    const response = await call(getSubmission, {
      as: people.participant.id,
      params: { id: eventId },
    });
    expect(response.status).toBe(200);
    expectServerTime(response);
    expect(submissionSchema.parse(await response.json())).toMatchObject({ id: null, version: 0 });
  });

  it('refuses someone signed out, and staff who are not on a team', async () => {
    await expectError(
      await call(getSubmission, { params: { id: eventId } }),
      401,
      'UNAUTHENTICATED',
    );
    for (const role of ['owner', 'admin', 'judge', 'volunteer'] as const) {
      await expectError(
        await call(getSubmission, { as: people[role].id, params: { id: eventId } }),
        404,
        'NOT_ON_TEAM',
      );
      await expectError(await put(people[role].id, { title: 'X' }, '0'), 404, 'NOT_ON_TEAM');
    }
  });

  it('needs If-Match', async () => {
    const body = await expectError(
      await put(people.participant.id, { title: 'X' }),
      400,
      'VALIDATION_FAILED',
    );
    expect(body.error.details?.fields).toHaveProperty('If-Match');
  });

  it('checks links and reports them on their field', async () => {
    const body = await expectError(
      await put(people.participant.id, { github_url: 'https://gitlab.com/a/b' }, '0'),
      400,
      'VALIDATION_FAILED',
    );
    expect(body.error.details?.fields).toHaveProperty('github_url');
  });

  it('saves with 200 and a new version, then 409 STALE_VERSION for the old one', async () => {
    const response = await put(
      people.participant.id,
      { title: 'ClinicQ', github_url: 'github.com/ciren/clinicq' },
      '0',
    );
    expect(response.status).toBe(200);
    const saved = submissionSchema.parse(await response.json());
    expect(saved).toMatchObject({ version: 1, github_url: 'https://github.com/ciren/clinicq' });

    const stale = await expectError(
      await put(people.participant.id, { title: 'Old' }, '"0"'),
      409,
      'STALE_VERSION',
    );
    expect(submissionSchema.parse(stale.error.details?.current).title).toBe('ClinicQ');
  });
});

describe('POST /events/{id}/teams/me/submission/submit', () => {
  it('needs a write-up, then submits', async () => {
    await expectError(
      await call(submit, { method: 'POST', as: people.participant.id, params: { id: eventId } }),
      400,
      'VALIDATION_FAILED',
    );
    await put(people.participant.id, { title: 'ClinicQ', write_up: 'Shorter clinic queues.' }, '1');
    const response = await call(submit, {
      method: 'POST',
      as: people.participant.id,
      params: { id: eventId },
    });
    expect(response.status).toBe(200);
    expect(submissionSchema.parse(await response.json()).status).toBe('submitted');
  });

  it('refuses a judge', async () => {
    await expectError(
      await call(submit, { method: 'POST', as: people.judge.id, params: { id: eventId } }),
      404,
      'NOT_ON_TEAM',
    );
  });
});

describe('deadline and reopen', () => {
  it('refuses saves with 423 after the deadline; only the owner can reopen', async () => {
    await sql`
      update events set starts_at = now() - interval '1 day', submission_deadline = now() - interval '1 minute'
      where id = ${eventId}
    `;
    await expectError(
      await put(people.participant.id, { title: 'Late' }, '2'),
      423,
      'SUBMISSION_LOCKED',
    );

    const deadline = new Date(Date.now() + 3_600_000).toISOString();
    for (const role of ['admin', 'judge', 'mentor', 'volunteer', 'participant'] as const) {
      await expectError(
        await call(reopen, {
          method: 'POST',
          as: people[role].id,
          params: { id: eventId },
          body: { submission_deadline: deadline },
        }),
        403,
        'FORBIDDEN',
      );
    }
    const response = await call(reopen, {
      method: 'POST',
      as: people.owner.id,
      params: { id: eventId },
      body: { submission_deadline: deadline },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      submission_deadline: deadline,
      submissions_locked_at: null,
    });

    const saved = await put(
      people.participant.id,
      { title: 'After the outage', write_up: 'Yes' },
      '2',
    );
    expect(saved.status).toBe(200);
  });
});
