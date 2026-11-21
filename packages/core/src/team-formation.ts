import { SKILLS, type SkillRatings } from '@hx/shared';

/**
 * Organizer team forming (R36): balanced teams from the four built-in skill ratings, so the
 * strongest people don't end up together. Deterministic: the same people give the same teams.
 */

export interface GroupCandidate {
  id: string;
  /** Null for someone who hasn't rated their skills; counted as the middle of the scale. */
  ratings: SkillRatings | null;
}

/** The rating used for someone with no ratings: the middle of the 1 to 5 scale. */
export const UNRATED = 3;

/** A rating of this or more counts as strong in that skill. */
const STRONG = 4;

/** How much an even overall strength matters next to each single skill. */
const TOTAL_WEIGHT = 2;

/** The cost of a team with nobody strong in a skill, so strong people spread out. */
const COVERAGE_PENALTY = 0.5;

/** Ratings in SKILLS order, with the unrated default filled in. */
export function ratingVector(ratings: SkillRatings | null): number[] {
  return SKILLS.map((skill) => ratings?.[skill] ?? UNRATED);
}

/** The sum of all four ratings, 4 to 20. */
export function ratingTotal(ratings: SkillRatings | null): number {
  return ratingVector(ratings).reduce((sum, r) => sum + r, 0);
}

/**
 * How many people go in each team: as few teams as possible without going over `teamSize`,
 * with sizes that differ by at most one. 10 people in teams of 4 → [4, 3, 3].
 */
export function teamSizes(count: number, teamSize: number): number[] {
  if (count <= 0) return [];
  const size = Math.max(1, Math.floor(teamSize));
  const teams = Math.ceil(count / size);
  const base = Math.floor(count / teams);
  const extra = count % teams;
  return Array.from({ length: teams }, (_, i) => base + (i < extra ? 1 : 0));
}

/** Average rating per skill, in SKILLS order, then the average total. */
export function teamAverages(members: (SkillRatings | null)[]): number[] {
  const dims = SKILLS.length + 1;
  if (members.length === 0) return Array.from({ length: dims }, () => 0);
  const sums = Array.from({ length: dims }, () => 0);
  for (const ratings of members) {
    const v = ratingVector(ratings);
    v.forEach((r, i) => (sums[i] = (sums[i] ?? 0) + r));
    sums[dims - 1] = (sums[dims - 1] ?? 0) + v.reduce((a, b) => a + b, 0);
  }
  return sums.map((s) => s / members.length);
}

interface Person {
  id: string;
  v: number[];
  total: number;
}

/**
 * Splits `candidates` into balanced teams of at most `teamSize`.
 *
 * 1. Order people by total rating (strongest first) and deal them out in a snake
 *    (1, 2, 3, 3, 2, 1, …), so each team gets a fair share of strong and new people.
 * 2. Swap people between teams while it brings every team's average in each skill, and in
 *    total, closer to the event's average, and while it gives more teams someone strong in
 *    each skill.
 */
export function autoGroup(candidates: GroupCandidate[], teamSize: number): string[][] {
  const people: Person[] = candidates
    .map((c) => {
      const v = ratingVector(c.ratings);
      return { id: c.id, v, total: v.reduce((a, b) => a + b, 0) };
    })
    .sort((a, b) => b.total - a.total || a.id.localeCompare(b.id));
  const sizes = teamSizes(people.length, teamSize);
  if (sizes.length <= 1) return sizes.length === 1 ? [people.map((p) => p.id)] : [];

  const teams = snakeDraft(people, sizes);
  improveBySwaps(teams, people);
  return teams.map((team) => team.map((p) => p.id));
}

/** Deals people out in snake order (0, 1, …, k−1, k−1, …, 0, …), skipping full teams. */
function snakeDraft(people: Person[], sizes: number[]): Person[][] {
  const teams: Person[][] = sizes.map(() => []);
  const k = sizes.length;
  let turn = 0;
  for (const person of people) {
    for (;;) {
      const position = turn % k;
      const team = Math.floor(turn / k) % 2 === 0 ? position : k - 1 - position;
      turn++;
      const members = teams[team] as Person[];
      if (members.length < (sizes[team] ?? 0)) {
        members.push(person);
        break;
      }
    }
  }
  return teams;
}

function improveBySwaps(teams: Person[][], people: Person[]): void {
  const dims = SKILLS.length + 1;
  const mean = Array.from({ length: dims }, (_, d) =>
    d < SKILLS.length
      ? people.reduce((s, p) => s + (p.v[d] ?? 0), 0) / people.length
      : people.reduce((s, p) => s + p.total, 0) / people.length,
  );
  const cost = (team: Person[]): number => teamCost(team, mean);
  const costs = teams.map(cost);

  for (let pass = 0; pass < 50; pass++) {
    let improved = false;
    for (let a = 0; a < teams.length; a++) {
      for (let b = a + 1; b < teams.length; b++) {
        const teamA = teams[a] as Person[];
        const teamB = teams[b] as Person[];
        for (let i = 0; i < teamA.length; i++) {
          for (let j = 0; j < teamB.length; j++) {
            const x = teamA[i] as Person;
            const y = teamB[j] as Person;
            if (sameRatings(x, y)) continue;
            teamA[i] = y;
            teamB[j] = x;
            const nextA = cost(teamA);
            const nextB = cost(teamB);
            if (nextA + nextB < (costs[a] ?? 0) + (costs[b] ?? 0) - 1e-9) {
              costs[a] = nextA;
              costs[b] = nextB;
              improved = true;
            } else {
              teamA[i] = x;
              teamB[j] = y;
            }
          }
        }
      }
    }
    if (!improved) break;
  }
}

function sameRatings(x: Person, y: Person): boolean {
  return x.v.every((r, i) => r === y.v[i]);
}

/** Distance of the team's averages from the event's, plus a cost per skill with nobody strong. */
function teamCost(team: Person[], mean: number[]): number {
  if (team.length === 0) return 0;
  let cost = 0;
  for (let d = 0; d < SKILLS.length; d++) {
    const avg = team.reduce((s, p) => s + (p.v[d] ?? 0), 0) / team.length;
    cost += (avg - (mean[d] ?? 0)) ** 2;
    if (!team.some((p) => (p.v[d] ?? 0) >= STRONG)) cost += COVERAGE_PENALTY;
  }
  const total = team.reduce((s, p) => s + p.total, 0) / team.length;
  cost += TOTAL_WEIGHT * ((total - (mean[SKILLS.length] ?? 0)) / SKILLS.length) ** 2;
  return cost;
}
