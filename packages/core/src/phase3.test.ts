import { describe, expect, it } from 'vitest';
import {
  formatInviteCode,
  generateInviteCode,
  INVITE_ALPHABET,
  normalizeInviteCode,
  submissionsClosed,
} from './index';

describe('generateInviteCode', () => {
  it('is 8 characters from the alphabet, never a look-alike', () => {
    for (let i = 0; i < 2000; i++) {
      const code = generateInviteCode();
      expect(code).toMatch(/^[A-Z2-9]{8}$/);
      expect(code).not.toMatch(/[01OIL]/);
    }
  });

  it('never uses the look-alikes in its alphabet', () => {
    for (const char of '01OIL') expect(INVITE_ALPHABET).not.toContain(char);
    expect(new Set(INVITE_ALPHABET).size).toBe(INVITE_ALPHABET.length);
  });

  it('skips bytes that would bias the result and maps the rest evenly', () => {
    // 250 is above the rejection limit (248) and is skipped; 0 maps to A, 30 to 9.
    const bytes = [250, 0, 30, 0, 30, 0, 30, 0, 30, 0, 0, 0, 0, 0, 0, 0];
    expect(generateInviteCode(() => new Uint8Array(bytes))).toBe('A9A9A9A9');
  });

  it('spreads across the alphabet', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) for (const c of generateInviteCode()) seen.add(c);
    expect(seen.size).toBe(INVITE_ALPHABET.length);
  });
});

describe('normalizeInviteCode', () => {
  it('accepts lower case, spaces and dashes', () => {
    expect(normalizeInviteCode('k7qm x4pr')).toBe('K7QMX4PR');
    expect(normalizeInviteCode(' K7QM-X4PR ')).toBe('K7QMX4PR');
  });

  it.each(['K7QMX4P', 'K7QMX4PRS', 'K7QMO4PR', 'K7QM14PR', 'K7QM!4PR', ''])(
    'rejects %j',
    (input) => {
      expect(normalizeInviteCode(input)).toBeNull();
    },
  );

  it('formats codes the way the design shows them', () => {
    expect(formatInviteCode('K7QMX4PR')).toBe('K7QM X4PR');
  });
});

describe('submissionsClosed', () => {
  const deadline = new Date('2026-12-06T12:00:00Z');

  it('is open before the deadline and closed at it', () => {
    const event = { submission_deadline: deadline, submissions_locked_at: null };
    expect(submissionsClosed(event, new Date('2026-12-06T11:59:59.999Z'))).toBe(false);
    expect(submissionsClosed(event, deadline)).toBe(true);
  });

  it('is closed once locked, even before the deadline (reopen sets a new deadline)', () => {
    const event = {
      submission_deadline: deadline,
      submissions_locked_at: new Date('2026-12-06T10:00:00Z'),
    };
    expect(submissionsClosed(event, new Date('2026-12-06T11:00:00Z'))).toBe(true);
  });
});
