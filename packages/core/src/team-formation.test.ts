import type { SkillRatings } from '@hx/shared';
import { describe, expect, it } from 'vitest';
import {
  autoGroup,
  ratingTotal,
  teamAverages,
  teamSizes,
  type GroupCandidate,
} from './team-formation';

const r = (
  coding: number,
  design: number,
  business: number,
  presentation: number,
): SkillRatings => ({
  coding,
  design,
  business,
  presentation,
});
const person = (id: string, ratings: SkillRatings | null): GroupCandidate => ({ id, ratings });

/** The spread of team totals: max minus min of the teams' average total rating. */
function spread(teams: string[][], people: GroupCandidate[]): number {
  const byId = new Map(people.map((p) => [p.id, p.ratings]));
  const totals = teams.map(
    (t) => t.reduce((s, id) => s + ratingTotal(byId.get(id) ?? null), 0) / t.length,
  );
  return Math.max(...totals) - Math.min(...totals);
}

describe('teamSizes', () => {
  it('uses as few teams as fit, with sizes that differ by at most one', () => {
    expect(teamSizes(12, 4)).toEqual([4, 4, 4]);
    expect(teamSizes(10, 4)).toEqual([4, 3, 3]);
    expect(teamSizes(3, 4)).toEqual([3]);
    expect(teamSizes(0, 4)).toEqual([]);
  });
});

describe('autoGroup', () => {
  // 4 experts in everything and 4 beginners: the naive split puts the experts together.
  const mixed = [
    ...['e1', 'e2', 'e3', 'e4'].map((id) => person(id, r(5, 5, 5, 5))),
    ...['b1', 'b2', 'b3', 'b4'].map((id) => person(id, r(1, 1, 1, 1))),
  ];

  it('places everyone exactly once, in teams of the planned sizes', () => {
    const people = Array.from({ length: 10 }, (_, i) =>
      person(`p${i}`, r((i % 5) + 1, ((i + 2) % 5) + 1, ((i + 4) % 5) + 1, ((i + 1) % 5) + 1)),
    );
    const teams = autoGroup(people, 4);
    expect(teams.map((t) => t.length).sort()).toEqual([3, 3, 4]);
    expect(teams.flat().sort()).toEqual(people.map((p) => p.id).sort());
  });

  it('splits the strongest people across teams', () => {
    const teams = autoGroup(mixed, 4);
    for (const team of teams) {
      expect(team.filter((id) => id.startsWith('e'))).toHaveLength(2);
    }
  });

  it('gives each team someone strong in a skill when there are enough of them', () => {
    // Three strong coders among twelve people: one per team of four.
    const people = [
      ...['c1', 'c2', 'c3'].map((id) => person(id, r(5, 2, 2, 2))),
      ...Array.from({ length: 9 }, (_, i) => person(`o${i}`, r(2, 3, 3, 3))),
    ];
    const teams = autoGroup(people, 4);
    for (const team of teams) {
      expect(team.filter((id) => id.startsWith('c'))).toHaveLength(1);
    }
  });

  it('is more even than splitting a sorted list into chunks', () => {
    const people = Array.from({ length: 24 }, (_, i) =>
      person(
        `p${String(i).padStart(2, '0')}`,
        r(1 + (i % 5), 1 + ((i * 3) % 5), 1 + ((i * 7) % 5), 1 + ((i * 2) % 5)),
      ),
    );
    const sorted = [...people].sort((a, b) => ratingTotal(b.ratings) - ratingTotal(a.ratings));
    const chunks = Array.from({ length: 6 }, (_, i) =>
      sorted.slice(i * 4, i * 4 + 4).map((p) => p.id),
    );
    expect(spread(autoGroup(people, 4), people)).toBeLessThan(spread(chunks, people));
  });

  it('counts people with no ratings as the middle of the scale', () => {
    expect(teamAverages([null])).toEqual([3, 3, 3, 3, 12]);
    const teams = autoGroup([...mixed.slice(0, 2), person('u1', null), person('u2', null)], 2);
    expect(teams).toHaveLength(2);
    for (const team of teams) expect(team.filter((id) => id.startsWith('e'))).toHaveLength(1);
  });

  it('gives the same teams for the same people', () => {
    expect(autoGroup(mixed, 4)).toEqual(autoGroup([...mixed].reverse(), 4));
  });

  it('handles nobody and one small group', () => {
    expect(autoGroup([], 4)).toEqual([]);
    expect(autoGroup(mixed.slice(0, 3), 4)).toEqual([['e1', 'e2', 'e3']]);
  });
});
