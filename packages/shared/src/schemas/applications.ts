import { z } from 'zod';
import { APPLICATION_STATUSES, DECISION_STATUSES, MAX_BULK_DECISIONS } from '../constants';
import { isoDateTimeSchema, uuidSchema } from './base';

export const applicationStatusSchema = z.enum(APPLICATION_STATUSES);
export const decisionStatusSchema = z.enum(DECISION_STATUSES);

/** Answers keyed by question id. Text answers are strings; multi_choice answers are arrays. */
export const answersSchema = z.record(
  z.string().max(40),
  z.union([z.string().max(5000), z.array(z.string().max(200)).max(30)]),
);
export type Answers = z.infer<typeof answersSchema>;

/** POST /events/{id}/applications */
export const applyBodySchema = z.object({ answers: answersSchema }).strict();

/** The applicant's own view of their application. */
export const myApplicationSchema = z.object({
  id: uuidSchema,
  event_id: uuidSchema,
  status: applicationStatusSchema,
  answers: answersSchema,
  /** Set when the applicant confirms. Shown as a QR ticket from Phase 3. */
  ticket_code: z.string().nullable(),
  created_at: isoDateTimeSchema,
  decided_at: isoDateTimeSchema.nullable(),
});
export type MyApplication = z.infer<typeof myApplicationSchema>;

/** POST /events/{id}/applications/me/rsvp */
export const rsvpBodySchema = z.object({ response: z.enum(['confirm', 'decline']) }).strict();

/** One row of the organizer's review table. */
export const applicationListItemSchema = z.object({
  id: uuidSchema,
  user_id: uuidSchema,
  name: z.string(),
  email: z.string(),
  school: z.string().nullable(),
  level_of_study: z.string().nullable(),
  graduation_year: z.number().int().nullable(),
  country: z.string().nullable(),
  github_username: z.string().nullable(),
  status: applicationStatusSchema,
  answers: answersSchema,
  created_at: isoDateTimeSchema,
  decided_at: isoDateTimeSchema.nullable(),
});
export type ApplicationListItem = z.infer<typeof applicationListItemSchema>;

/** GET /events/{id}/applications?status=&q=&cursor=&limit= */
export const applicationListQuerySchema = z.object({
  status: applicationStatusSchema.optional(),
  q: z.string().trim().max(100).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ApplicationListQuery = z.infer<typeof applicationListQuerySchema>;

export const applicationCountsSchema = z.object({
  all: z.number().int(),
  submitted: z.number().int(),
  accepted: z.number().int(),
  waitlisted: z.number().int(),
  rejected: z.number().int(),
  confirmed: z.number().int(),
  declined: z.number().int(),
});
export type ApplicationCounts = z.infer<typeof applicationCountsSchema>;

export const applicationListResponseSchema = z.object({
  items: z.array(applicationListItemSchema),
  /** Pass back as ?cursor= for the next page; null on the last page. */
  next_cursor: z.string().nullable(),
  counts: applicationCountsSchema,
});
export type ApplicationListResponse = z.infer<typeof applicationListResponseSchema>;

/** POST /events/{id}/applications/decisions */
export const decisionsBodySchema = z
  .object({
    application_ids: z
      .array(uuidSchema)
      .min(1, 'Select at least one application.')
      .max(MAX_BULK_DECISIONS)
      .refine((ids) => new Set(ids).size === ids.length, 'Each application once.'),
    status: decisionStatusSchema,
  })
  .strict();
export type DecisionsBody = z.infer<typeof decisionsBodySchema>;

export const decisionsResponseSchema = z.object({
  /** Applications whose status changed. */
  updated: z.array(uuidSchema),
  /** Already had that status: nothing changed and no email was queued. */
  unchanged: z.array(uuidSchema),
  /** Not changed, with the reason (e.g. the applicant already confirmed). */
  skipped: z.array(z.object({ id: uuidSchema, reason: z.string() })),
});
export type DecisionsResponse = z.infer<typeof decisionsResponseSchema>;
