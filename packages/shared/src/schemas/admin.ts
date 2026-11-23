import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './base';

// The platform admin area (R43): organizers by email, existing accounts only. Platform admins are
// a fixed list of at most two emails, set in the database; the app can't change it (R44).

/** POST /admin/organizers: the account's email address. */
export const adminEmailBodySchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email('Enter an email address.')),
  })
  .strict();
export type AdminEmailBody = z.infer<typeof adminEmailBodySchema>;

export const adminUserParamsSchema = z.object({ userId: uuidSchema });

export const adminPersonSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  email: z.string(),
  avatar_url: z.string().nullable(),
  created_at: isoDateTimeSchema,
});
export type AdminPerson = z.infer<typeof adminPersonSchema>;

/** One address on the fixed platform admin list, and its account once it has signed in. */
export const platformAdminSchema = z.object({
  email: z.string(),
  id: uuidSchema.nullable(),
  name: z.string().nullable(),
  /** Signed in with Google or GitHub, with that email confirmed: admin rights are on. */
  active: z.boolean(),
});
export type PlatformAdmin = z.infer<typeof platformAdminSchema>;

/** Who can create CIReN events, and who can run the whole platform. */
export const adminPeopleSchema = z.object({
  organizers: z.array(adminPersonSchema),
  admins: z.array(platformAdminSchema),
});
export type AdminPeople = z.infer<typeof adminPeopleSchema>;
