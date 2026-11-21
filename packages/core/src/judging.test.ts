import { describe, expect, it } from 'vitest';
import { assignJudges, computeStandings, type ScoreInput } from './judging';

const ids = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(2, '0')}`);

describe('assignJudges', () => {
  const submissionIds = ids('s', 25);
  const judgeIds = ids('j', 7);

  it('gives every submission exactly N judges, with loads within 1', () => {
    const { assignments, short } = assignJudges({
      submissionIds,
      judgeIds,
      perSubmission: 3,
      conflicts: [],
      seed: 'x',
    });
    expect(short).toEqual([]);
    for (const s of submissionIds) {
      const judges = assignments.filter((a) => a.submission_id === s).map((a) => a.judge_id);
      expect(new Set(judges).size).toBe(3);
      expect(judges).toHaveLength(3);
    }
    const loads = judgeIds.map((j) => assignments.filter((a) => a.judge_id === j).length);
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(1);
  });

  it('never assigns a conflict', () => {
    const conflicts = submissionIds
      .slice(0, 10)
      .map((s) => ({ judge_id: 'j00', submission_id: s }));
    const { assignments } = assignJudges({
      submissionIds,
      judgeIds,
      perSubmission: 3,
      conflicts,
      seed: 'y',
    });
    for (const c of conflicts) expect(assignments).not.toContainEqual(c);
    expect(assignments.filter((a) => a.submission_id === 's00')).toHaveLength(3);
  });

  it('gives the same result for the same seed, and a different one for another seed', () => {
    const input = { submissionIds, judgeIds, perSubmission: 3, conflicts: [], seed: 'same' };
    expect(assignJudges(input)).toEqual(assignJudges(input));
    expect(assignJudges({ ...input, seed: 'other' }).assignments).not.toEqual(
      assignJudges(input).assignments,
    );
  });

  it('keeps fixed assignments and tops submissions up to N', () => {
    const fixed = [{ judge_id: 'j03', submission_id: 's00' }];
    const { assignments } = assignJudges({
      submissionIds,
      judgeIds,
      perSubmission: 3,
      conflicts: [],
      fixed,
      seed: 'z',
    });
    const s00 = assignments.filter((a) => a.submission_id === 's00');
    expect(s00).toHaveLength(3);
    expect(s00).toContainEqual(fixed[0]);
  });

  it('reports submissions that could not get enough judges', () => {
    const { short } = assignJudges({
      submissionIds: ['s1'],
      judgeIds: ['a', 'b'],
      perSubmission: 3,
      conflicts: [],
      seed: 'q',
    });
    expect(short).toEqual([{ submission_id: 's1', judges: 2 }]);
  });
});

/** One criterion out of 10: a judge's total is 10 times the score. */
const ONE = [{ id: 'c', max_score: 10, weight: 1, is_tiebreaker: false }];

function scored(judge: string, entries: [string, number][]): ScoreInput[] {
  return entries.map(([submission_id, score]) => ({
    judge_id: judge,
    submission_id,
    criterion_id: 'c',
    score,
  }));
}

function input(scores: ScoreInput[], criteria = ONE, tracks: Record<string, string[]> = {}) {
  const subs = [...new Set(scores.map((s) => s.submission_id))].sort();
  const pairs = [...new Set(scores.map((s) => `${s.judge_id}|${s.submission_id}`))];
  return {
    criteria,
    scores,
    assignments: pairs.map((k) => {
      const [judge_id = '', submission_id = ''] = k.split('|');
      return { judge_id, submission_id };
    }),
    submissions: subs.map((id) => ({ id, track_ids: tracks[id] ?? [] })),
  };
}

describe('computeStandings', () => {
  it('ranks a generous judge 9 (mean 8.5, spread 0.5) below a harsh judge 6 (mean 4.5, spread 1)', () => {
    const generous = scored('generous', [
      ['A', 9],
      ['g1', 8],
      ['g2', 9],
      ['g3', 8],
    ]);
    const harsh = scored('harsh', [
      ['B', 6],
      ['h1', 3],
      ['h2', 3.5],
      ['h3', 5],
      ['h4', 5],
      ['h5', 4.5],
    ]);
    const standings = computeStandings(input([...generous, ...harsh]));
    const a = standings.overall.find((r) => r.submission_id === 'A');
    const b = standings.overall.find((r) => r.submission_id === 'B');
    expect(a?.raw).toBeCloseTo(90);
    expect(b?.raw).toBeCloseTo(60);
    expect(a?.normalized).toBeCloseTo(1);
    expect(b?.normalized).toBeCloseTo(1.5);
    expect(b?.rank).toBe(1);
    expect(a?.rank).toBe(2);
    const harshStats = standings.judges.find((j) => j.judge_id === 'harsh');
    expect(harshStats?.mean).toBeCloseTo(45);
    expect(harshStats?.spread).toBeCloseTo(10);
    expect(harshStats?.pooled).toBe(false);
  });

  it('uses the pooled mean and spread for a judge with 3 scores', () => {
    const many = scored('many', [
      ['a', 2],
      ['b', 4],
      ['c', 6],
      ['d', 8],
    ]);
    const few = scored('few', [
      ['e', 5],
      ['f', 7],
      ['g', 9],
    ]);
    const standings = computeStandings(input([...many, ...few]));
    expect(standings.judges.find((j) => j.judge_id === 'few')?.pooled).toBe(true);
    const totals = [20, 40, 60, 80, 50, 70, 90];
    const mean = totals.reduce((x, y) => x + y) / totals.length;
    const spread = Math.sqrt(totals.reduce((x, t) => x + (t - mean) ** 2, 0) / totals.length);
    expect(standings.overall.find((r) => r.submission_id === 'g')?.normalized).toBeCloseTo(
      (90 - mean) / spread,
    );
  });

  it('uses the pooled mean and spread for a judge who gives identical scores', () => {
    const flat = scored('flat', [
      ['a', 7],
      ['b', 7],
      ['c', 7],
      ['d', 7],
    ]);
    const varied = scored('varied', [
      ['e', 2],
      ['f', 4],
      ['g', 6],
      ['h', 8],
    ]);
    const standings = computeStandings(input([...flat, ...varied]));
    expect(standings.judges.find((j) => j.judge_id === 'flat')).toMatchObject({
      spread: 0,
      pooled: true,
    });
    const a = standings.overall.find((r) => r.submission_id === 'a')?.normalized;
    expect(Number.isFinite(a)).toBe(true);
  });

  it('breaks a tie with the tiebreaker criterion, and reports an exact tie as a tie', () => {
    const criteria = [
      { id: 'idea', max_score: 10, weight: 1, is_tiebreaker: false },
      { id: 'code', max_score: 10, weight: 1, is_tiebreaker: true },
    ];
    const row = (submission_id: string, idea: number, code: number): ScoreInput[] => [
      { judge_id: 'j', submission_id, criterion_id: 'idea', score: idea },
      { judge_id: 'j', submission_id, criterion_id: 'code', score: code },
    ];
    // X and Y total the same; Y has the better code score. Z and W are exactly equal.
    const scores = [
      ...row('X', 8, 6),
      ...row('Y', 6, 8),
      ...row('Z', 3, 3),
      ...row('W', 3, 3),
      ...row('V', 1, 1),
    ];
    const standings = computeStandings(input(scores, criteria));
    const find = (id: string) => standings.overall.find((r) => r.submission_id === id);
    expect(find('Y')).toMatchObject({ rank: 1, tied: false });
    expect(find('X')).toMatchObject({ rank: 2, tied: false });
    expect(find('Z')).toMatchObject({ rank: 3, tied: true });
    expect(find('W')).toMatchObject({ rank: 3, tied: true });
    expect(find('V')).toMatchObject({ rank: 5, tied: false });
  });

  it('ranks within each track, counts progress, and leaves unscored submissions unranked', () => {
    const scores = scored('j', [
      ['a', 9],
      ['b', 5],
      ['c', 7],
      ['d', 3],
    ]);
    const data = input(scores, ONE, { a: ['health'], b: ['health'], c: ['fintech'] });
    data.submissions.push({ id: 'unscored', track_ids: ['health'] });
    data.assignments.push({ judge_id: 'j', submission_id: 'unscored' });
    const standings = computeStandings(data);
    expect(standings.progress).toEqual({ scored: 4, expected: 5 });
    const health = standings.tracks.find((t) => t.track_id === 'health')?.rows ?? [];
    expect(health.map((r) => [r.submission_id, r.rank])).toEqual([
      ['a', 1],
      ['b', 2],
      ['unscored', null],
    ]);
  });

  it('ignores incomplete score sets', () => {
    const criteria = [
      { id: 'c', max_score: 10, weight: 1, is_tiebreaker: false },
      { id: 'd', max_score: 5, weight: 2, is_tiebreaker: false },
    ];
    const scores: ScoreInput[] = [
      { judge_id: 'j', submission_id: 'a', criterion_id: 'c', score: 5 },
    ];
    const standings = computeStandings(input(scores, criteria));
    expect(standings.overall[0]).toMatchObject({ rank: null, raw: null, judges_scored: 0 });
  });
});
