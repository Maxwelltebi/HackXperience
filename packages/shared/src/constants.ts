/** Response header carrying the server's clock (UTC ISO 8601). Clients use it for countdowns. */
export const SERVER_TIME_HEADER = 'server_time';

/** Optional header carrying a client-generated UUID for a create, so a retry is harmless. */
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/** All API routes live under this prefix. */
export const API_PREFIX = '/api/v1';

/** Platforms a push token can come from. */
export const PUSH_PLATFORMS = ['android', 'ios', 'web'] as const;

/** The CIReN organization, seeded by migration 0001_identity. */
export const CIREN_ORG_ID = '00000000-0000-4000-8000-00000000c12e';

export const EVENT_STATUSES = ['draft', 'published', 'live', 'judging', 'completed'] as const;
export const EVENT_MODES = ['in_person', 'virtual', 'hybrid'] as const;
export const STAFF_ROLES = ['owner', 'admin', 'judge', 'mentor', 'volunteer'] as const;
export const APPLICATION_STATUSES = [
  'submitted',
  'accepted',
  'waitlisted',
  'rejected',
  'confirmed',
  'declined',
] as const;
/** Statuses an organizer can set. confirmed and declined come from the applicant's RSVP. */
export const DECISION_STATUSES = ['accepted', 'waitlisted', 'rejected'] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];
export type EventMode = (typeof EVENT_MODES)[number];
export type StaffRole = (typeof STAFF_ROLES)[number];
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

/** Decision emails wait this long so an organizer can change their mind (DESIGN Step 6.5). */
export const DECISION_EMAIL_DELAY_MINUTES = 10;

/** Most applications one bulk decision can touch. */
export const MAX_BULK_DECISIONS = 500;

/** Team join attempts allowed per user per minute (build plan Phase 3). */
export const TEAM_JOIN_LIMIT_PER_MINUTE = 10;

/** Request header carrying the submission version a save is based on (DESIGN Step 4). */
export const IF_MATCH_HEADER = 'if-match';

export const SUBMISSION_STATUSES = ['draft', 'submitted'] as const;
export const SHA_STATES = ['none', 'pending', 'captured', 'unreachable'] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];
export type ShaState = (typeof SHA_STATES)[number];

/** Submission field limits. The write-up is markdown. */
export const SUBMISSION_LIMITS = { title: 80, tagline: 140, writeUp: 20_000 } as const;

/** Deadline reminder emails go out this long before the deadline (build plan Phase 4 item 8). */
export const REMINDER_KINDS = ['24h', '1h'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

/** Rate limits per user per minute (build plan Phase 7 item 5). Joining is TEAM_JOIN_LIMIT_PER_MINUTE. */
export const RATE_LIMITS_PER_MINUTE = {
  apply: 5,
  inviteRotate: 5,
  mentorRequest: 5,
  repoCheck: 20,
  /** Event alert sign-ups, per IP address: the pop-up needs no account (R42). */
  alertSignup: 5,
} as const;

/**
 * Event alert emails (R42): when an event is published, when its applications open, and
 * before they close. Subscribers need no account.
 */
export const EVENT_ALERT_KINDS = ['published', 'applications_open', 'closing_soon'] as const;
export type EventAlertKind = (typeof EVENT_ALERT_KINDS)[number];
export const EVENT_ALERTS = {
  /** "Closing soon" goes out this long before applications close… */
  closingSoonHours: 48,
  /** …but never within this long of another alert for the same event. */
  quietHours: 24,
  /** No "applications open" or "closing soon" alert with less than this left to apply. */
  minimumLeftHours: 1,
} as const;

/** The built-in skills every applicant rates, 1 to 5, for organizer team forming (R36). */
export const SKILLS = ['coding', 'design', 'business', 'presentation'] as const;
export type Skill = (typeof SKILLS)[number];
export const SKILL_LABELS: Record<Skill, string> = {
  coding: 'Coding',
  design: 'Design',
  business: 'Business',
  presentation: 'Presentation',
};
/** What each rating means, shown next to the 1 to 5 scale. */
export const SKILL_SCALE = { min: 1, max: 5, low: 'New to it', high: 'Expert' } as const;
/** Teams in one organizer draft, at most. */
export const MAX_DRAFT_TEAMS = 200;

/** Project images (R41): the storage bucket and its limits (also set on the bucket itself). */
export const PROJECT_IMAGES = {
  bucket: 'project-images',
  max: 6,
  maxBytes: 5 * 1024 * 1024,
  types: ['image/png', 'image/jpeg', 'image/webp'],
  captionMax: 140,
} as const;
export type ProjectImageType = (typeof PROJECT_IMAGES.types)[number];
