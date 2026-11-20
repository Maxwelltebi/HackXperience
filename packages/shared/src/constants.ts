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
