import { EVENT_STATUSES, type ApplicationQuestion, type EventStatus } from '@hx/shared';
import { describe, expect, it } from 'vitest';
import {
  applicationsOpen,
  checkEventTransition,
  decideApplication,
  EVENT_TRANSITIONS,
  generateTicketCode,
  rsvpApplication,
  slugify,
  validateAnswers,
  validateEventTimes,
  type EventTransitionContext,
} from './index';

const NOW = new Date('2026-12-06T12:00:00Z');

function ctx(
  status: EventStatus,
  overrides: Partial<EventTransitionContext> = {},
): EventTransitionContext {
  return {
    event: {
      status,
      applications_open_at: '2026-11-01T00:00:00Z',
      applications_close_at: '2026-11-30T00:00:00Z',
      submission_deadline: '2026-12-06T10:00:00Z',
      ends_at: '2026-12-06T18:00:00Z',
    },
    now: NOW,
    applicationCount: 0,
    rubricCount: 1,
    ...overrides,
  };
}

describe('event status transitions', () => {
  const allowed: [EventStatus, EventStatus][] = [
    ['draft', 'published'],
    ['published', 'draft'],
    ['published', 'live'],
    ['live', 'judging'],
    ['judging', 'completed'],
  ];

  it.each(allowed)('allows %s → %s when its checks pass', (from, to) => {
    expect(checkEventTransition(to, ctx(from))).toEqual({ ok: true });
  });

  const refused = EVENT_STATUSES.flatMap((from) =>
    EVENT_STATUSES.filter((to) => !EVENT_TRANSITIONS[from].includes(to)).map(
      (to) => [from, to] as [EventStatus, EventStatus],
    ),
  );

  it('refuses every other pair', () => {
    expect(refused).toHaveLength(EVENT_STATUSES.length ** 2 - allowed.length);
  });

  it.each(refused)('refuses %s → %s', (from, to) => {
    const result = checkEventTransition(to, ctx(from));
    expect(result.ok).toBe(false);
  });

  it('refuses publishing without an application window', () => {
    const context = ctx('draft');
    context.event.applications_open_at = null;
    expect(checkEventTransition('published', context)).toEqual({
      ok: false,
      reasons: ['Set when applications open and close.'],
    });
  });

  it('refuses publishing with a window that closes before it opens or after the event', () => {
    const backwards = ctx('draft');
    backwards.event.applications_close_at = '2026-10-01T00:00:00Z';
    expect(checkEventTransition('published', backwards).ok).toBe(false);
    const late = ctx('draft');
    late.event.applications_close_at = '2026-12-07T00:00:00Z';
    expect(checkEventTransition('published', late).ok).toBe(false);
  });

  it('refuses unpublishing once someone has applied', () => {
    expect(checkEventTransition('draft', ctx('published', { applicationCount: 1 })).ok).toBe(false);
  });

  it('refuses judging before the deadline or without a rubric', () => {
    expect(
      checkEventTransition('judging', ctx('live', { now: new Date('2026-12-06T09:59:59Z') })).ok,
    ).toBe(false);
    expect(checkEventTransition('judging', ctx('live', { rubricCount: 0 })).ok).toBe(false);
  });
});

describe('application decisions', () => {
  it.each([
    ['submitted', 'accepted'],
    ['submitted', 'waitlisted'],
    ['submitted', 'rejected'],
    ['accepted', 'rejected'],
    ['rejected', 'accepted'],
    ['waitlisted', 'accepted'],
  ] as const)('%s → %s changes', (from, to) => {
    expect(decideApplication(from, to)).toEqual({ kind: 'change', to });
  });

  it('treats the same status as unchanged', () => {
    expect(decideApplication('accepted', 'accepted')).toEqual({ kind: 'unchanged' });
  });

  it.each(['accepted', 'waitlisted', 'rejected'] as const)(
    'lets organizers change a confirmed applicant (%s)',
    (to) => {
      expect(decideApplication('confirmed', to)).toEqual({ kind: 'change', to });
    },
  );

  it.each(['accepted', 'waitlisted', 'rejected'] as const)(
    'lets organizers decide again after a decline (%s)',
    (to) => {
      expect(decideApplication('declined', to)).toEqual({ kind: 'change', to });
    },
  );
});

describe('RSVP', () => {
  it('confirms from accepted, and confirming twice is unchanged', () => {
    expect(rsvpApplication('accepted', 'confirm')).toEqual({ kind: 'change', to: 'confirmed' });
    expect(rsvpApplication('confirmed', 'confirm')).toEqual({ kind: 'unchanged' });
  });

  it('declines from accepted or confirmed', () => {
    expect(rsvpApplication('accepted', 'decline')).toEqual({ kind: 'change', to: 'declined' });
    expect(rsvpApplication('confirmed', 'decline')).toEqual({ kind: 'change', to: 'declined' });
  });

  it.each(['submitted', 'waitlisted', 'rejected', 'declined'] as const)(
    'refuses confirming from %s',
    (from) => {
      expect(rsvpApplication(from, 'confirm').kind).toBe('refused');
    },
  );

  it.each(['submitted', 'waitlisted', 'rejected'] as const)('refuses declining from %s', (from) => {
    expect(rsvpApplication(from, 'decline').kind).toBe('refused');
  });
});

describe('applicationsOpen', () => {
  const event = {
    status: 'published' as EventStatus,
    applications_open_at: '2026-11-01T00:00:00Z',
    applications_close_at: '2026-11-30T00:00:00Z',
    deleted_at: null,
  };

  it('is open inside the window, closed at and after the close time', () => {
    expect(applicationsOpen(event, new Date('2026-11-15T00:00:00Z'))).toBe(true);
    expect(applicationsOpen(event, new Date('2026-11-30T00:00:00Z'))).toBe(false);
    expect(applicationsOpen(event, new Date('2026-10-31T23:59:59Z'))).toBe(false);
  });

  it('is closed for drafts, judging events and deleted events', () => {
    const inside = new Date('2026-11-15T00:00:00Z');
    expect(applicationsOpen({ ...event, status: 'draft' }, inside)).toBe(false);
    expect(applicationsOpen({ ...event, status: 'judging' }, inside)).toBe(false);
    expect(applicationsOpen({ ...event, deleted_at: '2026-11-02T00:00:00Z' }, inside)).toBe(false);
  });
});

describe('validateAnswers', () => {
  const questions: ApplicationQuestion[] = [
    { id: 'why', type: 'long_text', label: 'Why?', required: true },
    { id: 'github', type: 'url', label: 'GitHub', required: false },
    {
      id: 'track',
      type: 'single_choice',
      label: 'Track',
      required: true,
      options: ['Health', 'FinTech'],
    },
    {
      id: 'skills',
      type: 'multi_choice',
      label: 'Skills',
      required: false,
      options: ['Design', 'Code'],
    },
  ];

  it('accepts good answers, trims them, and drops blank optional ones', () => {
    expect(
      validateAnswers(questions, { why: '  I build things ', github: '', track: 'Health' }),
    ).toEqual({ ok: true, answers: { why: 'I build things', track: 'Health' } });
  });

  it('reports a missing required answer', () => {
    const result = validateAnswers(questions, { track: 'Health' });
    expect(result).toEqual({ ok: false, fields: { 'answers.why': 'This question is required.' } });
  });

  it('reports a wrong option for single and multi choice', () => {
    const result = validateAnswers(questions, {
      why: 'x',
      track: 'Space',
      skills: ['Code', 'Juggling'],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.fields).sort()).toEqual(['answers.skills', 'answers.track']);
    }
  });

  it('reports a bad URL', () => {
    for (const bad of ['github.com/ama', 'javascript:alert(1)', 'https://localhost']) {
      const result = validateAnswers(questions, { why: 'x', track: 'Health', github: bad });
      expect(result).toEqual({
        ok: false,
        fields: { 'answers.github': 'Enter the full link, starting with https://' },
      });
    }
  });

  it('reports answers to questions that do not exist, and wrong types', () => {
    const result = validateAnswers(questions, { why: ['a'], track: 'Health', extra: 'x' });
    expect(result).toEqual({
      ok: false,
      fields: { 'answers.extra': 'Not a question on this form.', 'answers.why': 'Enter text.' },
    });
  });

  it('removes duplicate multi-choice picks', () => {
    expect(
      validateAnswers(questions, { why: 'x', track: 'Health', skills: ['Code', 'Code'] }),
    ).toEqual({
      ok: true,
      answers: { why: 'x', track: 'Health', skills: ['Code'] },
    });
  });
});

describe('validateEventTimes', () => {
  const good = {
    applications_open_at: '2026-11-01T00:00:00Z',
    applications_close_at: '2026-11-30T00:00:00Z',
    starts_at: '2026-12-05T09:00:00Z',
    submission_deadline: '2026-12-06T12:00:00Z',
    ends_at: '2026-12-06T18:00:00Z',
    team_size_min: 1,
    team_size_max: 4,
  };

  it('accepts a consistent event', () => {
    expect(validateEventTimes(good)).toEqual({});
  });

  it('flags each inconsistency on the field to fix', () => {
    expect(validateEventTimes({ ...good, submission_deadline: good.starts_at })).toHaveProperty(
      'submission_deadline',
    );
    expect(validateEventTimes({ ...good, ends_at: '2026-12-06T11:00:00Z' })).toHaveProperty(
      'ends_at',
    );
    expect(validateEventTimes({ ...good, applications_open_at: null })).toHaveProperty(
      'applications_open_at',
    );
    expect(
      validateEventTimes({ ...good, applications_close_at: '2026-10-01T00:00:00Z' }),
    ).toHaveProperty('applications_close_at');
    expect(validateEventTimes({ ...good, team_size_min: 5 })).toHaveProperty('team_size_max');
  });

  it('allows no application window at all (a draft)', () => {
    expect(
      validateEventTimes({ ...good, applications_open_at: null, applications_close_at: null }),
    ).toEqual({});
  });
});

describe('slugify', () => {
  it('makes a URL slug', () => {
    expect(slugify('The CIReN Experience 5.0')).toBe('the-ciren-experience-5-0');
    expect(slugify('  Hack Day: Accra!  ')).toBe('hack-day-accra');
    expect(slugify('Hé')).toBe('event-he');
  });
});

describe('generateTicketCode', () => {
  it('is URL-safe and at least 16 characters', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateTicketCode()).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    }
  });

  it('is derived from the random bytes it is given', () => {
    expect(generateTicketCode((n) => new Uint8Array(n).fill(255))).toBe('_____________________w');
  });
});
