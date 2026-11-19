/** Response header carrying the server's clock (UTC ISO 8601). Clients use it for countdowns. */
export const SERVER_TIME_HEADER = 'server_time';

/** All API routes live under this prefix. */
export const API_PREFIX = '/api/v1';

/** Platforms a push token can come from. */
export const PUSH_PLATFORMS = ['android', 'ios', 'web'] as const;

/** The CIReN organization, seeded by migration 0001_identity. */
export const CIREN_ORG_ID = '00000000-0000-4000-8000-00000000c12e';
