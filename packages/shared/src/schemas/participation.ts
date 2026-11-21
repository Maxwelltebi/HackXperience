import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './base';

// ---------- Tickets and check-in ----------

/** GET /events/{id}/me/ticket. The QR code encodes ticket_code. */
export const ticketSchema = z.object({
  ticket_code: z.string(),
  event_id: uuidSchema,
  event_name: z.string(),
  name: z.string(),
  /** Set once a volunteer has checked the holder in. */
  checked_in_at: isoDateTimeSchema.nullable(),
});
export type Ticket = z.infer<typeof ticketSchema>;

/** POST /events/{id}/check-ins */
export const scanBodySchema = z.object({ ticket_code: z.string().trim().min(1).max(100) }).strict();

/** POST /events/{id}/check-ins/manual */
export const manualCheckInBodySchema = z.object({ user_id: uuidSchema }).strict();

/** The result screen after a check-in (screens PDF page 7). */
export const checkInResultSchema = z.object({
  user_id: uuidSchema,
  name: z.string(),
  school: z.string().nullable(),
  team_name: z.string().nullable(),
  checked_in_at: isoDateTimeSchema,
  method: z.enum(['scan', 'manual']),
});
export type CheckInResult = z.infer<typeof checkInResultSchema>;

/** GET /events/{id}/check-ins/stats: "214 of 300 confirmed checked in". */
export const checkInStatsSchema = z.object({
  confirmed: z.number().int(),
  checked_in: z.number().int(),
});
export type CheckInStats = z.infer<typeof checkInStatsSchema>;

/** GET /events/{id}/check-ins/search?q=: confirmed attendees for manual check-in. */
export const attendeeSearchQuerySchema = z.object({ q: z.string().trim().min(2).max(100) });
export const attendeeSchema = z.object({
  user_id: uuidSchema,
  name: z.string(),
  email: z.string(),
  school: z.string().nullable(),
  checked_in_at: isoDateTimeSchema.nullable(),
});
export type Attendee = z.infer<typeof attendeeSchema>;

// ---------- Teams ----------

const teamName = z.string().trim().min(1, 'Name your team.').max(60);
const lookingFor = z
  .string()
  .trim()
  .max(280)
  .transform((value) => (value === '' ? null : value))
  .nullable();

/** POST /events/{id}/teams. Mobile sends a client-generated id (or Idempotency-Key). */
export const createTeamBodySchema = z.object({ name: teamName }).strict();

/** POST /events/{id}/teams/join */
export const joinTeamBodySchema = z
  .object({ invite_code: z.string().trim().min(1, 'Enter the invite code.').max(20) })
  .strict();

/** PATCH /events/{id}/teams/me: name and find-a-team board fields. */
export const updateTeamBodySchema = z
  .object({ name: teamName, looking_for_members: z.boolean(), looking_for: lookingFor })
  .partial()
  .strict();

export const teamMemberSchema = z.object({
  user_id: uuidSchema,
  name: z.string(),
  school: z.string().nullable(),
  joined_at: isoDateTimeSchema,
});

/** The caller's own team, invite code included. */
export const myTeamSchema = z.object({
  id: uuidSchema,
  event_id: uuidSchema,
  name: z.string(),
  invite_code: z.string(),
  owner_id: uuidSchema,
  looking_for_members: z.boolean(),
  looking_for: z.string().nullable(),
  members: z.array(teamMemberSchema),
  team_size_max: z.number().int(),
  created_at: isoDateTimeSchema,
});
export type MyTeam = z.infer<typeof myTeamSchema>;

/** One team on the find-a-team board. Never includes the invite code. */
export const openTeamSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  looking_for: z.string().nullable(),
  member_count: z.number().int(),
  members: z.array(z.object({ name: z.string(), school: z.string().nullable() })),
});
export type OpenTeam = z.infer<typeof openTeamSchema>;

export const teamParamsSchema = z.object({ id: uuidSchema, userId: uuidSchema });

/** A team on the organizer Teams screen, deleted ones included (Phase 7). */
export interface OrganizerTeam {
  id: string;
  name: string;
  members: string[];
  deleted_at: string | null;
  submission: { id: string; title: string; status: string; deleted_at: string | null } | null;
}
