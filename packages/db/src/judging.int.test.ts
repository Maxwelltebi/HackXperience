// Judging and results (build plan Phase 5) against the local database.
import { randomUUID } from 'node:crypto';
import { ApiError, putScoresBodySchema } from '@hx/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeSql, getSql, tx } from './client';
import { changeEventStatus } from './events';
import { getPublicProfile } from './identity';
import {
  assignJudgesForEvent,
  getJudgeQueue,
  getPublishedStandings,
  getResults,
  getStandings,
  getSubmissionForJudging,
  getTeamFeedback,
  listGallery,
  putMyScores,
  setAwardWinners,
} from './judging';
import { createSetupItem } from './setup';
import { createTeam } from './teams';
import { confirmApplicant, testData } from './testing';

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

interface Fixture {
  eventId: string;
  ownerId: string;
  judges: string[];
  /** One per team: the submission, its team and its first member. */
  projects: { submissionId: string; teamId: string; memberId: string }[];
  idea: string;
  code: string;
  health: string;
}

/**
 * An event in judging: a two-criterion rubric (code is the tiebreaker), a Health track,
 * `teams` submitted projects (the first two in Health), one draft, and `judges` judges.
 */
async function judgingEvent(teams: number, judges: number): Promise<Fixture> {
  const owner = await data.user('Owner');
  const { id: eventId } = await data.event(owner.id);
  const [health] = await sql<[{ id: string }]>`
    insert into tracks (event_id, name) values (${eventId}, 'Health') returning id
  `;
  const projects: Fixture['projects'] = [];
  for (let i = 0; i <= teams; i++) {
    const member = await data.user(`Hacker ${i}`);
    await confirmApplicant(sql, eventId, member.id);
    const team = await tx((t) => createTeam(t, eventId, member.id, randomUUID(), `Team ${i}`));
    const draft = i === teams; // the last team never submits
    const [s] = await sql<[{ id: string }]>`
      insert into submissions (event_id, team_id, title, write_up, status, submitted_at)
      values (${eventId}, ${team.id}, ${draft ? '' : `Project ${i}`}, ${draft ? '' : 'Write-up'},
              ${draft ? 'draft' : 'submitted'}, ${draft ? null : new Date()})
      returning id
    `;
    if (i < 2) {
      await sql`insert into submission_tracks (submission_id, track_id) values (${s.id}, ${health.id})`;
    }
    if (!draft) projects.push({ submissionId: s.id, teamId: team.id, memberId: member.id });
  }
  const judgeIds: string[] = [];
  for (let j = 0; j < judges; j++) {
    const judge = await data.user(`Judge ${j}`);
    await data.staff(eventId, judge.id, 'judge');
    judgeIds.push(judge.id);
  }
  const [idea] = await sql<[{ id: string }]>`
    insert into rubric_criteria (event_id, name, max_score, weight, position)
    values (${eventId}, 'Idea', 10, 1, 0) returning id
  `;
  const [code] = await sql<[{ id: string }]>`
    insert into rubric_criteria (event_id, name, max_score, weight, position, is_tiebreaker)
    values (${eventId}, 'Code', 10, 1, 1, true) returning id
  `;
  await sql`
    update events set status = 'live', starts_at = now() - interval '2 days',
                      submission_deadline = now() - interval '1 minute'
    where id = ${eventId}
  `;
  await tx((t) => changeEventStatus(t, eventId, owner.id, 'judging'));
  return {
    eventId,
    ownerId: owner.id,
    judges: judgeIds,
    projects,
    idea: idea.id,
    code: code.id,
    health: health.id,
  };
}

const scores = (f: Fixture, idea: number, code: number, comment: string | null = null) =>
  putScoresBodySchema.parse({
    scores: [
      { criterion_id: f.idea, score: idea, comment },
      { criterion_id: f.code, score: code },
    ],
  });

describe('starting judging', () => {
  it('locks submissions, so judging starts from final projects', async () => {
    const f = await judgingEvent(1, 1);
    const [event] = await sql<[{ submissions_locked_at: Date | null }]>`
      select submissions_locked_at from events where id = ${f.eventId}
    `;
    expect(event.submissions_locked_at).not.toBeNull();
  }, 60_000);

  it('freezes the rubric once judging starts', async () => {
    const f = await judgingEvent(1, 1);
    expect(
      await outcome(() =>
        tx((t) =>
          createSetupItem(t, 'rubric', f.eventId, { name: 'Late', max_score: 5, weight: 1 }),
        ),
      ),
    ).toBe('CONFLICT');
  }, 60_000);
});

describe('assignment', () => {
  it('gives each submitted project N judges, never their own team, and skips drafts', async () => {
    const f = await judgingEvent(5, 3);
    // Judge 0 is also on team 0 (a mentor-turned-hacker, say): a conflict.
    const conflicted = f.projects[0];
    if (!conflicted) throw new Error('no project');
    await sql`
      insert into team_members (team_id, event_id, user_id)
      values (${conflicted.teamId}, ${f.eventId}, ${f.judges[0] ?? ''})
    `;
    const result = await tx((t) => assignJudgesForEvent(t, f.eventId, f.ownerId, 2, 'seed-1'));
    expect(result).toMatchObject({ judges: 3, submissions: 5, assignments: 10, short: [] });

    const rows = await sql<{ judge_id: string; submission_id: string }[]>`
      select judge_id, submission_id from judge_assignments where event_id = ${f.eventId}
    `;
    for (const p of f.projects) {
      expect(rows.filter((r) => r.submission_id === p.submissionId)).toHaveLength(2);
    }
    expect(rows).not.toContainEqual({
      judge_id: f.judges[0],
      submission_id: conflicted.submissionId,
    });

    // Running it again with the same seed changes nothing.
    await tx((t) => assignJudgesForEvent(t, f.eventId, f.ownerId, 2, 'seed-1'));
    const again = await sql<{ judge_id: string; submission_id: string }[]>`
      select judge_id, submission_id from judge_assignments where event_id = ${f.eventId}
    `;
    const key = (r: { judge_id: string; submission_id: string }) =>
      `${r.judge_id}${r.submission_id}`;
    expect(again.map(key).sort()).toEqual(rows.map(key).sort());
  }, 60_000);
});

describe('scoring', () => {
  let f: Fixture;
  let judge: string;
  let mine: string;
  let other: string;

  beforeAll(async () => {
    f = await judgingEvent(2, 2);
    await tx((t) => assignJudgesForEvent(t, f.eventId, f.ownerId, 1, 'one-each'));
    judge = f.judges[0] ?? '';
    const queue = await getJudgeQueue(sql, f.eventId, judge);
    mine = queue.items[0]?.submission_id ?? '';
    other = f.projects.find((p) => p.submissionId !== mine)?.submissionId ?? '';
  }, 60_000);

  it("refuses to show a judge a submission that isn't theirs", async () => {
    expect(
      await outcome(() =>
        getSubmissionForJudging(sql, f.eventId, other, { userId: judge, readAll: false }),
      ),
    ).toBe('NOT_FOUND');
    const shown = await getSubmissionForJudging(sql, f.eventId, mine, {
      userId: judge,
      readAll: false,
    });
    expect(shown.criteria).toHaveLength(2);
  });

  it('checks every criterion is scored, within its max', async () => {
    expect(
      await outcome(() => tx((t) => putMyScores(t, f.eventId, mine, judge, scores(f, 11, 5)))),
    ).toBe('VALIDATION_FAILED');
    const partial = putScoresBodySchema.parse({
      scores: [{ criterion_id: f.idea, score: 5 }],
    });
    expect(await outcome(() => tx((t) => putMyScores(t, f.eventId, mine, judge, partial)))).toBe(
      'VALIDATION_FAILED',
    );
    expect(
      await outcome(() => tx((t) => putMyScores(t, f.eventId, other, judge, scores(f, 5, 5)))),
    ).toBe('NOT_FOUND');
  });

  it('saves, updates and audits scores; the queue shows progress', async () => {
    await tx((t) => putMyScores(t, f.eventId, mine, judge, scores(f, 7, 8, 'Nice demo')));
    const updated = await tx((t) => putMyScores(t, f.eventId, mine, judge, scores(f, 8, 8)));
    expect(updated.my_scores.find((s) => s.criterion_id === f.idea)?.score).toBe(8);
    const queue = await getJudgeQueue(sql, f.eventId, judge);
    expect(queue).toMatchObject({ scored: 1, total: 1, judging_open: true });
    const audits = await sql`
      select 1 from audit_log where event_id = ${f.eventId} and action = 'scores.saved'
    `;
    expect(audits).toHaveLength(2);
  });
});

describe('publishing results', () => {
  let f: Fixture;

  beforeAll(async () => {
    f = await judgingEvent(3, 2);
    await tx((t) => assignJudgesForEvent(t, f.eventId, f.ownerId, 2, 'all'));
    const [p0, p1, p2] = f.projects as [
      Fixture['projects'][number],
      Fixture['projects'][number],
      Fixture['projects'][number],
    ];
    const [j0, j1] = f.judges as [string, string];
    const score = (judge: string, sid: string, idea: number, code: number, comment?: string) =>
      tx((t) => putMyScores(t, f.eventId, sid, judge, scores(f, idea, code, comment ?? null)));
    await score(j0, p0.submissionId, 9, 9, 'Strong idea');
    await score(j1, p0.submissionId, 8, 9, 'Clean code');
    await score(j0, p1.submissionId, 5, 5);
    await score(j1, p1.submissionId, 4, 6);
    await score(j0, p2.submissionId, 2, 3);
    await score(j1, p2.submissionId, 3, 2);
  }, 60_000);

  it('ranks with raw and normalized scores and full progress', async () => {
    const standings = await getStandings(sql, f.eventId);
    expect(standings.progress).toEqual({ scored: 6, expected: 6 });
    expect(standings.overall[0]?.submission_id).toBe(f.projects[0]?.submissionId);
    expect(standings.overall.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(standings.tracks[0]?.track_name).toBe('Health');
    expect(standings.tiebreaker).toBe('Code');
  });

  it('only lets winners in a track win a track award', async () => {
    const [trackAward] = await sql<[{ id: string }]>`
      insert into awards (event_id, track_id, name, rank) values (${f.eventId}, ${f.health}, 'Best health hack', 1)
      returning id
    `;
    const outside = f.projects[2]?.teamId ?? '';
    expect(
      await outcome(() =>
        tx((t) => setAwardWinners(t, f.eventId, trackAward.id, f.ownerId, [outside])),
      ),
    ).toBe('VALIDATION_FAILED');
    const awards = await tx((t) =>
      setAwardWinners(t, f.eventId, trackAward.id, f.ownerId, [f.projects[1]?.teamId ?? '']),
    );
    expect(awards[0]?.winners[0]?.team_name).toBe('Team 1');
  });

  it('freezes results at publication: later score edits change nothing', async () => {
    const [overall] = await sql<[{ id: string }]>`
      insert into awards (event_id, name, rank) values (${f.eventId}, 'Grand prize', 1) returning id
    `;
    await tx((t) =>
      setAwardWinners(t, f.eventId, overall.id, f.ownerId, [f.projects[0]?.teamId ?? '']),
    );
    expect(await outcome(() => getResults(sql, f.eventId))).toBe('RESULTS_NOT_PUBLISHED');

    await tx((t) => changeEventStatus(t, f.eventId, f.ownerId, 'completed'));
    const results = await getResults(sql, f.eventId);
    expect(results.projects).toBe(3);
    expect(results.awards.map((a) => a.name).sort()).toEqual(['Best health hack', 'Grand prize']);
    expect(results).not.toHaveProperty('standings');
    const frozen = await getPublishedStandings(sql, f.eventId);

    // The API refuses edits now…
    const judge = f.judges[0] ?? '';
    const sid = f.projects[2]?.submissionId ?? '';
    expect(
      await outcome(() => tx((t) => putMyScores(t, f.eventId, sid, judge, scores(f, 10, 10)))),
    ).toBe('JUDGING_CLOSED');
    expect(
      await outcome(() => tx((t) => setAwardWinners(t, f.eventId, overall.id, f.ownerId, []))),
    ).toBe('RESULTS_PUBLISHED');
    // …and even a direct database edit doesn't move published results.
    await sql`update scores set score = 10 where submission_id = ${sid}`;
    expect(await getPublishedStandings(sql, f.eventId)).toEqual(frozen);
    expect(await getResults(sql, f.eventId)).toEqual(results);
    expect((await getStandings(sql, f.eventId)).overall[0]?.submission_id).toBe(sid);
  });

  it("puts the badge on each winner's profile", async () => {
    const profile = await getPublicProfile(sql, f.projects[0]?.memberId ?? '');
    expect(profile?.badges.map((b) => b.award_name)).toEqual(['Grand prize']);
    const loser = await getPublicProfile(sql, f.projects[2]?.memberId ?? '');
    expect(loser?.badges).toEqual([]);
  });

  it('opens a paginated gallery of submitted projects', async () => {
    const first = await listGallery(sql, f.eventId, { limit: 2 });
    expect(first.items.map((i) => i.title)).toEqual(['Project 0', 'Project 1']);
    expect(first.items[0]?.awards).toEqual(['Grand prize']);
    const second = await listGallery(sql, f.eventId, {
      limit: 2,
      cursor: first.next_cursor ?? undefined,
    });
    expect(second.items.map((i) => i.title)).toEqual(['Project 2']);
    expect(second.next_cursor).toBeNull();
  });

  it("shows a team its judges' comments, without names", async () => {
    const feedback = await getTeamFeedback(sql, f.eventId, f.projects[0]?.memberId ?? '');
    expect(feedback.items.map((i) => i.comment).sort()).toEqual(['Clean code', 'Strong idea']);
    expect(new Set(feedback.items.map((i) => i.judge))).toEqual(new Set(['Judge 1', 'Judge 2']));
    expect(JSON.stringify(feedback)).not.toContain(f.judges[0]);
  });
});
