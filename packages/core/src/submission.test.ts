import { describe, expect, it } from 'vitest';
import { dueReminder, isAutoSubmittable, parseIfMatch, submitProblems } from './submission';

const DEADLINE = new Date('2026-12-06T18:00:00Z');
const before = (minutes: number) => new Date(DEADLINE.getTime() - minutes * 60_000);

describe('submitProblems', () => {
  it('allows a complete submission from a big enough team', () => {
    expect(submitProblems({ title: 'ClinicQ', write_up: 'Queues.' }, 2, 2)).toEqual({
      fields: {},
      tooSmall: false,
    });
  });

  it('needs a title and a write-up, ignoring whitespace', () => {
    expect(submitProblems({ title: '  ', write_up: '\n' }, 3, 1).fields).toEqual({
      title: 'Add a title before you submit.',
      write_up: 'Add a write-up before you submit.',
    });
  });

  it('flags a team below the minimum size', () => {
    expect(submitProblems({ title: 'A', write_up: 'B' }, 1, 2).tooSmall).toBe(true);
  });
});

describe('isAutoSubmittable', () => {
  it.each([
    [{ status: 'draft', title: 'A', write_up: 'B' }, true],
    [{ status: 'draft', title: 'A', write_up: ' ' }, false],
    [{ status: 'draft', title: '', write_up: 'B' }, false],
    [{ status: 'submitted', title: 'A', write_up: 'B' }, false],
  ])('%o → %s', (submission, expected) => {
    expect(isAutoSubmittable(submission)).toBe(expected);
  });
});

describe('dueReminder', () => {
  it.each([
    [25 * 60, null],
    [24 * 60, '24h'],
    [3 * 60, '24h'],
    [61, '24h'],
    [60, '1h'],
    [1, '1h'],
    [0, null],
    [-5, null],
  ])('%i minutes before the deadline → %s', (minutes, expected) => {
    expect(dueReminder(DEADLINE, before(minutes))).toBe(expected);
  });
});

describe('parseIfMatch', () => {
  it.each([
    ['3', 3],
    ['"3"', 3],
    ['W/"12"', 12],
    [' 0 ', 0],
  ])('reads %s', (header, version) => {
    expect(parseIfMatch(header)).toBe(version);
  });

  it.each([null, '', '*', 'abc', '-1', '1.5', '9999999999'])('refuses %s', (header) => {
    expect(parseIfMatch(header)).toBeNull();
  });
});
