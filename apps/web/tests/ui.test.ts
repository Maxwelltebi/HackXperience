import { describe, expect, it } from 'vitest';
import { formatRemaining, remainingParts } from '@/components/countdown';
import { formatElapsed, LOADING_WORDS, shuffled } from '@/components/loading-state';
import { eventPhase } from '@/lib/ui/event-phase';
import { initials } from '@/lib/ui/initials';

describe('eventPhase: the status badge words from the screens PDF', () => {
  const base = {
    status: 'published' as const,
    applications_open_at: '2026-11-01T00:00:00Z',
    applications_close_at: '2026-11-30T23:59:00Z',
    ends_at: '2026-12-06T18:00:00Z',
  };
  const at = (iso: string) => new Date(iso);

  it('says Upcoming before applications open', () => {
    expect(eventPhase(base, at('2026-10-31T12:00:00Z'))).toEqual({
      label: 'Upcoming',
      tone: 'info',
    });
  });

  it('says Applications open while they are open', () => {
    expect(eventPhase(base, at('2026-11-15T12:00:00Z')).label).toBe('Applications open');
  });

  it('says Applications closed between the close and the end', () => {
    expect(eventPhase(base, at('2026-12-02T12:00:00Z')).label).toBe('Applications closed');
  });

  it('says Ended after the end, even before results', () => {
    expect(eventPhase(base, at('2026-12-07T12:00:00Z')).label).toBe('Ended');
  });

  it('makes Live now the only solid badge', () => {
    expect(eventPhase({ ...base, status: 'live' })).toEqual({ label: 'Live now', tone: 'live' });
  });

  it('follows judging, completed and draft', () => {
    expect(eventPhase({ ...base, status: 'judging' }).label).toBe('Judging');
    expect(eventPhase({ ...base, status: 'completed' }).label).toBe('Ended');
    expect(eventPhase({ ...base, status: 'draft' }).label).toBe('Draft');
  });
});

describe('initials', () => {
  it('takes the first and last name', () => {
    expect(initials('Ama Mensah')).toBe('AM');
    expect(initials('  kwame  kofi boateng ')).toBe('KB');
  });

  it('handles one name and no name', () => {
    expect(initials('Efua')).toBe('E');
    expect(initials('')).toBe('?');
  });
});

describe('countdown parts', () => {
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  it('shows days, hours and minutes when a day or more is left', () => {
    expect(remainingParts(8 * day + 14 * hour + 22 * minute + 5000)).toEqual([
      { value: '08', unit: 'days' },
      { value: '14', unit: 'hours' },
      { value: '22', unit: 'min' },
    ]);
  });

  it('shows hours, minutes and seconds on the last day', () => {
    expect(remainingParts(5 * hour + 42 * minute + 10_000)).toEqual([
      { value: '05', unit: 'hours' },
      { value: '42', unit: 'min' },
      { value: '10', unit: 'sec' },
    ]);
  });

  it('never goes below zero', () => {
    expect(remainingParts(-5000).map((p) => p.value)).toEqual(['00', '00', '00']);
    expect(formatRemaining(-5000)).toBe('0m 00s');
  });
});

describe('loader words', () => {
  /** A fixed sequence instead of Math.random, so the order is the same every run. */
  const seeded = (values: number[]) => {
    let i = 0;
    return () => values[i++ % values.length] ?? 0;
  };

  it('uses every word once per round', () => {
    const deck = shuffled(LOADING_WORDS, undefined, seeded([0.3, 0.9, 0.1, 0.6]));
    expect([...deck].sort()).toEqual([...LOADING_WORDS].sort());
  });

  it('never repeats the word just shown when a round starts', () => {
    for (let seed = 0; seed < 20; seed++) {
      const deck = shuffled(['A', 'B', 'C'], 'A', seeded([seed / 20, 0.5, 0.2]));
      expect(deck[0]).not.toBe('A');
    }
  });

  it('formats the elapsed time in tenths, then minutes', () => {
    expect(formatElapsed(0)).toBe('0.0s');
    expect(formatElapsed(42)).toBe('4.2s');
    expect(formatElapsed(630)).toBe('1m 3.0s');
  });
});
