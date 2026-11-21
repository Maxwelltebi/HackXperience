// Phase 5: judging and results through the API, including every role that must be refused.
import { changeEventStatus, createTeam, getSql, tx } from '@hx/db';
import { confirmApplicant } from '@hx/db/testing';
import {
  assignJudgesResultSchema,
  galleryPageSchema,
  judgeQueueSchema,
  judgingSubmissionSchema,
  resultsSchema,
  standingsSchema,
} from '@hx/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as setWinners } from '@/app/api/v1/events/[id]/awards/[itemId]/winners/route';
import { POST as assign } from '@/app/api/v1/events/[id]/judging/assign/route';
import { GET as myQueue } from '@/app/api/v1/events/[id]/judging/me/route';
import { GET as standings } from '@/app/api/v1/events/[id]/judging/standings/route';
import { GET as results } from '@/app/api/v1/events/[id]/results/route';
import { GET as submission } from '@/app/api/v1/events/[id]/submissions/[sid]/route';
import { PUT as putScores } from '@/app/api/v1/events/[id]/submissions/[sid]/scores/me/route';
import { GET as gallery } from '@/app/api/v1/events/[id]/submissions/route';
import { GET as feedback } from '@/app/api/v1/events/[id]/teams/me/feedback/route';
import { GET as profile } from '@/app/api/v1/users/[id]/profile/route';
import { call, expectError, fixtures } from './helpers';

const fx = fixtures();
const sql = getSql();
afterAll(() => fx.cleanup());

let eventId: string;
let people: Awaited<ReturnType<typeof fx.eventWithRoles>>['people'];
let submissionId: string;
let teamId: string;
let criterionId: string;
let awardId: string;

beforeAll(async () => {
  const result = await fx.eventWithRoles();
  eventId = result.event.id;
  people = result.people;
  await confirmApplicant(sql, eventId, people.participant.id);
  const team = await tx((t) =>
    createTeam(t, eventId, people.participant.id, crypto.randomUUID(), 'ClinicQ'),
  );
  teamId = team.id;
  const [s] = await sql<[{ id: string }]>`
    insert into submissions (event_id, team_id, title, write_up, status, submitted_at)
    values (${eventId}, ${team.id}, 'ClinicQ', 'Queues', 'submitted', now()) returning id
  `;
  submissionId = s.id;
  const [c] = await sql<[{ id: string }]>`
    insert into rubric_criteria (event_id, name, max_score) values (${eventId}, 'Impact', 10) returning id
  `;
  criterionId = c.id;
  const [a] = await sql<[{ id: string }]>`
    insert into awards (event_id, name, rank) values (${eventId}, 'Grand prize', 1) returning id
  `;
  awardId = a.id;
  await sql`
    update events set status = 'live', starts_at = now() - interval '2 days',
                      submission_deadline = now() - interval '1 minute'
    where id = ${eventId}
  `;
  await tx((t) => changeEventStatus(t, eventId, people.owner.id, 'judging'));
}, 60_000);

const params = () => ({ id: eventId });
const subParams = () => ({ id: eventId, sid: submissionId });
const body = (score: number) => ({
  scores: [{ criterion_id: criterionId, score, comment: 'Great' }],
});

describe('assign and queue', () => {
  it.each(['judge', 'mentor', 'volunteer', 'participant'] as const)(
    'refuses a %s who tries to assign judges',
    async (role) => {
      await expectError(
        await call(assign, { method: 'POST', as: people[role].id, params: params(), body: {} }),
        403,
        'FORBIDDEN',
      );
    },
  );

  it('assigns for an admin and shows the judge their queue', async () => {
    const response = await call(assign, {
      method: 'POST',
      as: people.admin.id,
      params: params(),
      body: { judges_per_submission: 1 },
    });
    expect(response.status).toBe(200);
    expect(assignJudgesResultSchema.parse(await response.json()).assignments).toBe(1);

    const queue = await call(myQueue, { as: people.judge.id, params: params() });
    expect(judgeQueueSchema.parse(await queue.json()).total).toBe(1);
    await expectError(
      await call(myQueue, { as: people.owner.id, params: params() }),
      403,
      'FORBIDDEN',
    );
  });
});

describe('reading and scoring a submission', () => {
  it('shows it to the assigned judge and the owner, not to a participant or volunteer', async () => {
    const asJudge = await call(submission, { as: people.judge.id, params: subParams() });
    expect(judgingSubmissionSchema.parse(await asJudge.json()).title).toBe('ClinicQ');
    expect((await call(submission, { as: people.owner.id, params: subParams() })).status).toBe(200);
    for (const role of ['participant', 'volunteer', 'mentor'] as const) {
      await expectError(
        await call(submission, { as: people[role].id, params: subParams() }),
        403,
        'FORBIDDEN',
      );
    }
  });

  it('refuses scores from non-judges, and scores above the maximum', async () => {
    for (const role of ['owner', 'admin', 'participant'] as const) {
      await expectError(
        await call(putScores, {
          method: 'PUT',
          as: people[role].id,
          params: subParams(),
          body: body(5),
        }),
        403,
        'FORBIDDEN',
      );
    }
    await expectError(
      await call(putScores, {
        method: 'PUT',
        as: people.judge.id,
        params: subParams(),
        body: body(11),
      }),
      400,
      'VALIDATION_FAILED',
    );
  });

  it('saves the judge’s scores', async () => {
    const response = await call(putScores, {
      method: 'PUT',
      as: people.judge.id,
      params: subParams(),
      body: body(8),
    });
    expect(response.status).toBe(200);
    expect(judgingSubmissionSchema.parse(await response.json()).my_scores[0]?.score).toBe(8);
  });
});

describe('standings, awards and results', () => {
  it('shows standings to owners and admins only', async () => {
    const response = await call(standings, { as: people.owner.id, params: params() });
    expect(standingsSchema.parse(await response.json()).progress).toEqual({
      scored: 1,
      expected: 1,
    });
    for (const role of ['judge', 'volunteer', 'participant'] as const) {
      await expectError(
        await call(standings, { as: people[role].id, params: params() }),
        403,
        'FORBIDDEN',
      );
    }
  });

  it('lets an admin choose winners, and refuses a judge', async () => {
    await expectError(
      await call(setWinners, {
        method: 'POST',
        as: people.judge.id,
        params: { id: eventId, itemId: awardId },
        body: { team_ids: [teamId] },
      }),
      403,
      'FORBIDDEN',
    );
    const response = await call(setWinners, {
      method: 'POST',
      as: people.admin.id,
      params: { id: eventId, itemId: awardId },
      body: { team_ids: [teamId] },
    });
    expect(response.status).toBe(200);
  });

  it('keeps results, gallery and feedback private until completed, then public', async () => {
    await expectError(await call(results, { params: params() }), 404, 'RESULTS_NOT_PUBLISHED');
    await expectError(await call(gallery, { params: params() }), 404, 'RESULTS_NOT_PUBLISHED');
    expect((await call(gallery, { as: people.admin.id, params: params() })).status).toBe(200);
    await expectError(
      await call(feedback, { as: people.participant.id, params: params() }),
      404,
      'RESULTS_NOT_PUBLISHED',
    );

    await tx((t) => changeEventStatus(t, eventId, people.owner.id, 'completed'));

    const published = resultsSchema.parse(await (await call(results, { params: params() })).json());
    expect(published.awards[0]?.winners[0]?.team_name).toBe('ClinicQ');
    const page = galleryPageSchema.parse(await (await call(gallery, { params: params() })).json());
    expect(page.items[0]).toMatchObject({ title: 'ClinicQ', awards: ['Grand prize'] });
    const comments = await call(feedback, { as: people.participant.id, params: params() });
    expect(await comments.json()).toEqual({
      items: [{ judge: 'Judge 1', criterion_name: 'Impact', comment: 'Great' }],
    });
    await expectError(
      await call(putScores, {
        method: 'PUT',
        as: people.judge.id,
        params: subParams(),
        body: body(9),
      }),
      423,
      'JUDGING_CLOSED',
    );
  });

  it("puts the winner's badge on their public profile", async () => {
    const response = await call(profile, { params: { id: people.participant.id } });
    const body = (await response.json()) as { badges: { award_name: string }[] };
    expect(body.badges.map((b) => b.award_name)).toEqual(['Grand prize']);
  });
});
