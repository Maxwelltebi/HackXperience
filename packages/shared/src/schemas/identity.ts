import { z } from 'zod';
import { PUSH_PLATFORMS, STAFF_ROLES } from '../constants';
import { httpsUrlSchema, isoDateTimeSchema, timezoneSchema, uuidSchema } from './base';

/** Optional free-text field: trimmed, and "" becomes null so clearing a field works. */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable();
}

// ---------- Responses ----------

export const userSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  name: z.string(),
  is_platform_admin: z.boolean(),
  created_at: isoDateTimeSchema,
});
export type User = z.infer<typeof userSchema>;

export const profileSchema = z.object({
  bio: z.string().nullable(),
  avatar_url: z.string().nullable(),
  github_username: z.string().nullable(),
  school: z.string().nullable(),
  level_of_study: z.string().nullable(),
  graduation_year: z.number().int().nullable(),
  country: z.string().nullable(),
  gender: z.string().nullable(),
  timezone: z.string(),
  email_reminders: z.boolean(),
});
export type Profile = z.infer<typeof profileSchema>;

/** The caller's staff roles at one event (DESIGN Step 4: /me returns roles per event). */
export const eventRolesSchema = z.object({
  event_id: uuidSchema,
  roles: z.array(z.enum(STAFF_ROLES)),
});
export type EventRoles = z.infer<typeof eventRolesSchema>;

/** GET /me */
export const meResponseSchema = z.object({
  user: userSchema,
  profile: profileSchema,
  event_roles: z.array(eventRolesSchema),
  /** Organizations the caller can create events for. */
  org_ids: z.array(uuidSchema),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

/** A winner badge. Filled from award_winners in Phase 5; always empty before then. */
export const badgeSchema = z.object({
  award_id: uuidSchema,
  award_name: z.string(),
  event_id: uuidSchema,
  event_name: z.string(),
  event_slug: z.string(),
  team_name: z.string(),
});
export type Badge = z.infer<typeof badgeSchema>;

/** GET /users/{id}/profile. Public fields only: no email, gender, level, country or settings. */
export const publicProfileSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  avatar_url: z.string().nullable(),
  bio: z.string().nullable(),
  github_username: z.string().nullable(),
  school: z.string().nullable(),
  badges: z.array(badgeSchema),
});
export type PublicProfile = z.infer<typeof publicProfileSchema>;

// ---------- Requests ----------

const GITHUB_USERNAME = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

/** PATCH /me/profile. Every field optional; send only what changed. */
export const patchProfileBodySchema = z
  .object({
    name: z.string().trim().min(1, 'Enter your name.').max(100),
    bio: optionalText(1000),
    avatar_url: httpsUrlSchema.nullable(),
    github_username: z
      .string()
      .trim()
      .regex(GITHUB_USERNAME, 'Enter a GitHub username, not a link.')
      .nullable()
      .or(z.literal('').transform(() => null)),
    school: optionalText(200),
    level_of_study: optionalText(100),
    graduation_year: z.number().int().min(1950).max(2100).nullable(),
    country: optionalText(100),
    gender: optionalText(50),
    timezone: timezoneSchema,
    email_reminders: z.boolean(),
  })
  .partial()
  .strict();
export type PatchProfileBody = z.infer<typeof patchProfileBodySchema>;
export type PatchProfileInput = z.input<typeof patchProfileBodySchema>;

export const pushPlatformSchema = z.enum(PUSH_PLATFORMS);

/** POST /me/push-tokens */
export const registerPushTokenBodySchema = z
  .object({
    token: z.string().trim().min(1).max(512),
    platform: pushPlatformSchema,
  })
  .strict();
export type RegisterPushTokenBody = z.infer<typeof registerPushTokenBodySchema>;

export const pushTokenSchema = z.object({
  token: z.string(),
  platform: pushPlatformSchema,
  created_at: isoDateTimeSchema,
});
export type PushToken = z.infer<typeof pushTokenSchema>;

/** DELETE /me/push-tokens/{token} */
export const pushTokenParamsSchema = z.object({
  token: z.string().trim().min(1).max(512),
});

/** GET /health */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  database: z.literal('ok'),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
