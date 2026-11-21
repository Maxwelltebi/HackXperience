import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './base';

// ---------- Realtime hints ----------

/**
 * Every broadcast is a hint, not data (DESIGN Step 6 part 4): the client refetches through the
 * API. `version` is the database clock in milliseconds when the change happened; lists carry the
 * version they were read at, so a hint no newer than the list is ignored.
 */
export const liveHintSchema = z
  .object({ type: z.string(), id: z.string().optional(), version: z.number() })
  .passthrough();
export type LiveHint = z.infer<typeof liveHintSchema>;

/** The realtime event name every broadcast uses. */
export const LIVE_EVENT = 'hint';

export const liveTopics = {
  staff: (eventId: string) => `event:${eventId}:staff`,
  mentors: (eventId: string) => `event:${eventId}:mentors`,
  announcements: (eventId: string) => `event:${eventId}:announcements`,
  team: (teamId: string) => `team:${teamId}`,
  user: (userId: string) => `user:${userId}`,
};

// ---------- Announcements ----------

export const createAnnouncementBodySchema = z
  .object({
    title: z.string().trim().min(1, 'Add a title.').max(120),
    body: z.string().trim().min(1, 'Write the announcement.').max(2000),
  })
  .strict();

export const announcementSchema = z.object({
  id: uuidSchema,
  event_id: uuidSchema,
  author_name: z.string(),
  title: z.string(),
  body: z.string(),
  created_at: isoDateTimeSchema,
  pushed_at: isoDateTimeSchema.nullable(),
});
export type Announcement = z.infer<typeof announcementSchema>;

export const announcementsQuerySchema = z.object({ since: isoDateTimeSchema.optional() });
export const announcementListSchema = z.object({
  items: z.array(announcementSchema),
  version: z.number(),
});
export type AnnouncementList = z.infer<typeof announcementListSchema>;

// ---------- Mentor queue ----------

export const MENTOR_REQUEST_STATUSES = ['open', 'claimed', 'resolved', 'cancelled'] as const;
export type MentorRequestStatus = (typeof MENTOR_REQUEST_STATUSES)[number];

/** Most open or claimed requests a team may have at once. */
export const MAX_ACTIVE_MENTOR_REQUESTS = 3;

export const createMentorRequestBodySchema = z
  .object({
    topic: z.string().trim().min(1, 'What do you need help with?').max(120),
    description: z.string().trim().max(1000).default(''),
  })
  .strict();

export const mentorRequestSchema = z.object({
  id: uuidSchema,
  event_id: uuidSchema,
  team_id: uuidSchema,
  team_name: z.string(),
  requested_by_name: z.string(),
  topic: z.string(),
  description: z.string(),
  status: z.enum(MENTOR_REQUEST_STATUSES),
  claimed_by: uuidSchema.nullable(),
  claimed_by_name: z.string().nullable(),
  created_at: isoDateTimeSchema,
  claimed_at: isoDateTimeSchema.nullable(),
  resolved_at: isoDateTimeSchema.nullable(),
});
export type MentorRequest = z.infer<typeof mentorRequestSchema>;

export const mentorRequestsQuerySchema = z.object({
  status: z.enum(MENTOR_REQUEST_STATUSES).optional(),
});
export const mentorRequestListSchema = z.object({
  items: z.array(mentorRequestSchema),
  version: z.number(),
});
export type MentorRequestList = z.infer<typeof mentorRequestListSchema>;

export const mentorRequestParamsSchema = z.object({ rid: uuidSchema });

// ---------- Staff dashboard ----------

/** Live counts for owners and admins; also what event:{id}:staff broadcasts carry. */
export const liveStatsSchema = z.object({
  confirmed: z.number().int(),
  checked_in: z.number().int(),
  teams: z.number().int(),
  submitted: z.number().int(),
  drafts: z.number().int(),
  scores_in: z.number().int(),
  scores_expected: z.number().int(),
  mentor_open: z.number().int(),
  mentor_claimed: z.number().int(),
  version: z.number(),
});
export type LiveStats = z.infer<typeof liveStatsSchema>;
