// Judge assignment and standings (DESIGN Step 6 part 3). Pure functions, unit-tested.

// ---------- Seeded randomness ----------

/** A small deterministic PRNG (mulberry32) seeded from a string, so a seed replays exactly. */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

// ---------- Assignment ----------

export interface Assignment {
  judge_id: string;
  submission_id: string;
}

export interface AssignInput {
  submissionIds: readonly string[];
  judgeIds: readonly string[];
  /** Judges per submission (DESIGN: 3). */
  perSubmission: number;
  /** Pairs that must never be assigned, e.g. a judge on the submitting team. */
  conflicts: readonly Assignment[];
  /** Assignments to keep as they are (they already have scores); they count toward loads. */
  fixed?: readonly Assignment[];
  seed: string;
}

export interface AssignResult {
  assignments: Assignment[];
  /** Submissions that got fewer than perSubmission judges (too few judges without conflicts). */
  short: { submission_id: string; judges: number }[];
}

const pairKey = (a: Assignment) => `${a.judge_id}|${a.submission_id}`;

/**
 * Balanced judge assignment (build plan Phase 5 item 2). Shuffle the submissions with the seed;
 * give each one the judges with the fewest assignments so far, ties broken at random, skipping
 * conflicts. With no conflicts, judge loads end up within 1 of each other. The same input and
 * seed always give the same result. `fixed` assignments are kept and counted first.
 */
export function assignJudges(input: AssignInput): AssignResult {
  const random = seededRandom(input.seed);
  const judges = [...new Set(input.judgeIds)].sort();
  const conflicts = new Set(input.conflicts.map(pairKey));
  const load = new Map(judges.map((j) => [j, 0]));
  const taken = new Set<string>();
  const assignments: Assignment[] = [];

  for (const a of input.fixed ?? []) {
    if (!load.has(a.judge_id) || taken.has(pairKey(a))) continue;
    taken.add(pairKey(a));
    load.set(a.judge_id, (load.get(a.judge_id) ?? 0) + 1);
    assignments.push({ judge_id: a.judge_id, submission_id: a.submission_id });
  }

  const short: AssignResult['short'] = [];
  const submissions = shuffle([...new Set(input.submissionIds)].sort(), random);
  for (const submissionId of submissions) {
    const have = judges.filter((j) =>
      taken.has(pairKey({ judge_id: j, submission_id: submissionId })),
    );
    const need = Math.max(0, input.perSubmission - have.length);
    const candidates = judges
      .filter((j) => {
        const key = pairKey({ judge_id: j, submission_id: submissionId });
        return !taken.has(key) && !conflicts.has(key);
      })
      .map((j) => ({ j, load: load.get(j) ?? 0, tie: random() }))
      .sort((a, b) => a.load - b.load || a.tie - b.tie)
      .slice(0, need);
    for (const { j } of candidates) {
      const a = { judge_id: j, submission_id: submissionId };
      taken.add(pairKey(a));
      load.set(j, (load.get(j) ?? 0) + 1);
      assignments.push(a);
    }
    const total = have.length + candidates.length;
    if (total < input.perSubmission) short.push({ submission_id: submissionId, judges: total });
  }
  return { assignments, short };
}

// ---------- Standings ----------

export interface CriterionInput {
  id: string;
  max_score: number;
  weight: number;
  is_tiebreaker: boolean;
}

export interface ScoreInput {
  submission_id: string;
  judge_id: string;
  criterion_id: string;
  score: number;
}

export interface SubmissionInput {
  id: string;
  track_ids: readonly string[];
}

export interface StandingsInput {
  criteria: readonly CriterionInput[];
  scores: readonly ScoreInput[];
  assignments: readonly Assignment[];
  submissions: readonly SubmissionInput[];
}

export interface StandingRow {
  submission_id: string;
  /** 1-based competition rank (1, 1, 3); null when no judge has scored it yet. */
  rank: number | null;
  /** True when another submission has exactly the same score and tiebreaker. */
  tied: boolean;
  /** Average weighted total across its judges, 0 to 100. */
  raw: number | null;
  /** Average z-score across its judges (the ranking score). */
  normalized: number | null;
  /** Average tiebreaker criterion as a fraction of its maximum, if the event has one. */
  tiebreaker: number | null;
  judges_scored: number;
  judges_assigned: number;
}

export interface JudgeStats {
  judge_id: string;
  scored: number;
  assigned: number;
  mean: number | null;
  spread: number | null;
  /** True when this judge's z-scores use the pooled mean and spread (fewer than 4 scores or no spread). */
  pooled: boolean;
}

export interface Standings {
  overall: StandingRow[];
  tracks: { track_id: string; rows: StandingRow[] }[];
  judges: JudgeStats[];
  /** "212 of 240 scores in": judge-submission pairs fully scored, out of all assignments. */
  progress: { scored: number; expected: number };
}

/** A judge needs at least this many scored submissions to be normalized against themselves. */
export const MIN_SCORES_FOR_OWN_SPREAD = 4;
const EPSILON = 1e-9;

function meanAndSpread(values: readonly number[]): { mean: number; spread: number } {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  return { mean, spread: Math.sqrt(variance) };
}

const average = (values: readonly number[]) =>
  values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;

/**
 * Standings (build plan Phase 5 item 3). Each judge's scores of a submission become a weighted
 * total from 0 to 100; each total becomes a z-score against that judge's own mean and spread
 * (population), or against the pooled totals of all judges when the judge has fewer than 4
 * scores or a spread of 0; a submission's score is the average z across its judges. Ranked
 * highest first; equal scores are separated by the tiebreaker criterion, and if that is equal
 * too they share a rank and are reported as tied. Only complete score sets (every criterion)
 * count.
 */
export function computeStandings(input: StandingsInput): Standings {
  const criteria = new Map(input.criteria.map((c) => [c.id, c]));
  const weightSum = input.criteria.reduce((a, c) => a + c.weight, 0);
  const tiebreaker = input.criteria.find((c) => c.is_tiebreaker) ?? null;

  // Group scores by judge and submission.
  const sets = new Map<
    string,
    { judge_id: string; submission_id: string; byCriterion: Map<string, number> }
  >();
  for (const s of input.scores) {
    if (!criteria.has(s.criterion_id)) continue;
    const key = `${s.judge_id}|${s.submission_id}`;
    const set = sets.get(key) ?? {
      judge_id: s.judge_id,
      submission_id: s.submission_id,
      byCriterion: new Map(),
    };
    set.byCriterion.set(s.criterion_id, s.score);
    sets.set(key, set);
  }

  // Weighted totals for complete sets only.
  const totals: {
    judge_id: string;
    submission_id: string;
    total: number;
    tiebreak: number | null;
  }[] = [];
  for (const set of sets.values()) {
    if (input.criteria.length === 0 || set.byCriterion.size !== input.criteria.length) continue;
    let weighted = 0;
    for (const c of input.criteria)
      weighted += ((set.byCriterion.get(c.id) ?? 0) / c.max_score) * c.weight;
    totals.push({
      judge_id: set.judge_id,
      submission_id: set.submission_id,
      total: (100 * weighted) / weightSum,
      tiebreak: tiebreaker
        ? (set.byCriterion.get(tiebreaker.id) ?? 0) / tiebreaker.max_score
        : null,
    });
  }

  // Each judge's mean and spread, with the pooled fallback.
  const pooled =
    totals.length > 0 ? meanAndSpread(totals.map((t) => t.total)) : { mean: 0, spread: 0 };
  const judgeIds = [
    ...new Set([...input.assignments.map((a) => a.judge_id), ...totals.map((t) => t.judge_id)]),
  ].sort();
  const judges: JudgeStats[] = judgeIds.map((judgeId) => {
    const own = totals.filter((t) => t.judge_id === judgeId).map((t) => t.total);
    const stats = own.length > 0 ? meanAndSpread(own) : null;
    return {
      judge_id: judgeId,
      scored: own.length,
      assigned: input.assignments.filter((a) => a.judge_id === judgeId).length,
      mean: stats?.mean ?? null,
      spread: stats?.spread ?? null,
      pooled: !stats || own.length < MIN_SCORES_FOR_OWN_SPREAD || stats.spread < EPSILON,
    };
  });
  const scale = new Map(
    judges.map((j) => [
      j.judge_id,
      j.pooled ? pooled : { mean: j.mean ?? 0, spread: j.spread ?? 0 },
    ]),
  );
  const z = (judgeId: string, total: number) => {
    const s = scale.get(judgeId) ?? pooled;
    return s.spread < EPSILON ? 0 : (total - s.mean) / s.spread;
  };

  // Per-submission averages.
  const rows: StandingRow[] = input.submissions.map((sub) => {
    const mine = totals.filter((t) => t.submission_id === sub.id);
    const tiebreaks = mine.flatMap((t) => (t.tiebreak === null ? [] : [t.tiebreak]));
    return {
      submission_id: sub.id,
      rank: null,
      tied: false,
      raw: average(mine.map((t) => t.total)),
      normalized: average(mine.map((t) => z(t.judge_id, t.total))),
      tiebreaker: average(tiebreaks),
      judges_scored: mine.length,
      judges_assigned: input.assignments.filter((a) => a.submission_id === sub.id).length,
    };
  });

  const tracks = [...new Set(input.submissions.flatMap((s) => s.track_ids))].sort();
  return {
    overall: rank(rows),
    tracks: tracks.map((trackId) => ({
      track_id: trackId,
      rows: rank(
        rows
          .filter((r) =>
            input.submissions.find((s) => s.id === r.submission_id)?.track_ids.includes(trackId),
          )
          .map((r) => ({ ...r })),
      ),
    })),
    judges,
    progress: { scored: totals.length, expected: input.assignments.length },
  };
}

/** Same score and same tiebreaker, within floating-point noise. */
function sameScore(a: StandingRow, b: StandingRow): boolean {
  const close = (x: number | null, y: number | null) =>
    x === null || y === null ? x === y : Math.abs(x - y) < EPSILON;
  return close(a.normalized, b.normalized) && close(a.tiebreaker, b.tiebreaker);
}

/** Orders rows best first and gives competition ranks (1, 1, 3). Unscored rows go last, unranked. */
function rank(rows: StandingRow[]): StandingRow[] {
  const scored = rows.filter((r) => r.normalized !== null);
  const unscored = rows.filter((r) => r.normalized === null);
  scored.sort(
    (a, b) =>
      (b.normalized ?? 0) - (a.normalized ?? 0) ||
      (b.tiebreaker ?? 0) - (a.tiebreaker ?? 0) ||
      a.submission_id.localeCompare(b.submission_id),
  );
  // Rows within EPSILON of the next are a tie, even if the sort put them in id order.
  for (let i = 0; i < scored.length; i++) {
    const row = scored[i] as StandingRow;
    const previous = scored[i - 1];
    row.rank = previous && sameScore(previous, row) ? previous.rank : i + 1;
  }
  for (const row of scored) {
    row.tied = scored.some((other) => other !== row && other.rank === row.rank);
  }
  return [...scored, ...unscored.map((r) => ({ ...r, rank: null, tied: false }))];
}
