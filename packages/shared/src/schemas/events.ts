import { z } from 'zod';
import { EVENT_MODES, EVENT_STATUSES, STAFF_ROLES } from '../constants';
import { isoDateTimeSchema, timezoneSchema, uuidSchema } from './base';

export const eventStatusSchema = z.enum(EVENT_STATUSES);
export const eventModeSchema = z.enum(EVENT_MODES);
export const staffRoleSchema = z.enum(STAFF_ROLES);

export const slugSchema = z
  .string()
  .trim()
  .min(3, 'At least 3 characters.')
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, numbers and single hyphens only.');

// ---------- Application questions ----------

export const QUESTION_TYPES = [
  'short_text',
  'long_text',
  'single_choice',
  'multi_choice',
  'url',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

const CHOICE_TYPES: readonly QuestionType[] = ['single_choice', 'multi_choice'];

/** One custom application question: {id, type, label, required, options?} (build plan Phase 2). */
export const applicationQuestionSchema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^[a-z0-9_]{1,40}$/, 'Lowercase letters, numbers and underscores, up to 40.'),
    type: z.enum(QUESTION_TYPES),
    label: z.string().trim().min(1, 'Enter the question.').max(300),
    required: z.boolean(),
    options: z.array(z.string().trim().min(1).max(200)).min(2).max(30).optional(),
  })
  .strict()
  .superRefine((question, ctx) => {
    const isChoice = CHOICE_TYPES.includes(question.type);
    if (isChoice && !question.options) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Add at least two options.' });
    }
    if (!isChoice && question.options) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Only choice questions have options.',
      });
    }
    if (question.options && new Set(question.options).size !== question.options.length) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Options must be different.' });
    }
  });
export type ApplicationQuestion = z.infer<typeof applicationQuestionSchema>;

export const applicationQuestionsSchema = z
  .array(applicationQuestionSchema)
  .max(30)
  .superRefine((questions, ctx) => {
    const seen = new Set<string>();
    questions.forEach((question, index) => {
      if (seen.has(question.id)) {
        ctx.addIssue({
          code: 'custom',
          path: [index, 'id'],
          message: 'Question ids must be unique.',
        });
      }
      seen.add(question.id);
    });
  });

// ---------- Events ----------

export const eventSchema = z.object({
  id: uuidSchema,
  organization_id: uuidSchema,
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  timezone: z.string(),
  mode: eventModeSchema,
  location: z.string().nullable(),
  applications_open_at: isoDateTimeSchema.nullable(),
  applications_close_at: isoDateTimeSchema.nullable(),
  starts_at: isoDateTimeSchema,
  submission_deadline: isoDateTimeSchema,
  ends_at: isoDateTimeSchema,
  team_size_min: z.number().int(),
  team_size_max: z.number().int(),
  max_tracks_per_submission: z.number().int(),
  application_questions: z.array(applicationQuestionSchema),
  status: eventStatusSchema,
  submissions_locked_at: isoDateTimeSchema.nullable(),
  /** Set while an owner has opened the gallery before results (R40). */
  gallery_published_at: isoDateTimeSchema.nullable(),
});
export type Event = z.infer<typeof eventSchema>;

/** The project gallery is public once results are published, or once an owner opens it (R40). */
export function galleryOpen(event: {
  status: string;
  gallery_published_at: string | Date | null;
}): boolean {
  return event.status === 'completed' || event.gallery_published_at !== null;
}

/** POST /events/{id}/gallery {published} */
export const galleryPublishBodySchema = z.object({ published: z.boolean() }).strict();

export const eventSummarySchema = eventSchema.pick({
  id: true,
  name: true,
  slug: true,
  status: true,
  mode: true,
  location: true,
  timezone: true,
  starts_at: true,
  ends_at: true,
  applications_open_at: true,
  applications_close_at: true,
});
export type EventSummary = z.infer<typeof eventSummarySchema>;

const eventFields = {
  name: z.string().trim().min(1, 'Enter a name.').max(120),
  slug: slugSchema,
  description: z.string().max(10_000),
  timezone: timezoneSchema,
  mode: eventModeSchema,
  location: z
    .string()
    .trim()
    .max(200)
    .transform((value) => (value === '' ? null : value))
    .nullable(),
  applications_open_at: isoDateTimeSchema.nullable(),
  applications_close_at: isoDateTimeSchema.nullable(),
  starts_at: isoDateTimeSchema,
  submission_deadline: isoDateTimeSchema,
  ends_at: isoDateTimeSchema,
  team_size_min: z.number().int().min(1).max(20),
  team_size_max: z.number().int().min(1).max(20),
  max_tracks_per_submission: z.number().int().min(1).max(20),
};

/** POST /orgs/{orgId}/events. Creates a draft; the creator becomes its owner. */
export const createEventBodySchema = z
  .object({
    ...eventFields,
    slug: eventFields.slug.optional(),
    description: eventFields.description.optional(),
    location: eventFields.location.optional(),
    applications_open_at: eventFields.applications_open_at.optional(),
    applications_close_at: eventFields.applications_close_at.optional(),
    team_size_min: eventFields.team_size_min.optional(),
    team_size_max: eventFields.team_size_max.optional(),
    max_tracks_per_submission: eventFields.max_tracks_per_submission.optional(),
  })
  .strict();
export type CreateEventBody = z.infer<typeof createEventBodySchema>;

/** PATCH /events/{id}. Status is not editable here; use POST /events/{id}/status. */
export const updateEventBodySchema = z
  .object({ ...eventFields, application_questions: applicationQuestionsSchema })
  .partial()
  .strict();
export type UpdateEventBody = z.infer<typeof updateEventBodySchema>;

export const eventStatusBodySchema = z.object({ status: eventStatusSchema }).strict();

export const orgParamsSchema = z.object({ orgId: uuidSchema });
export const eventParamsSchema = z.object({ id: uuidSchema });
export const eventItemParamsSchema = z.object({ id: uuidSchema, itemId: uuidSchema });

/** GET /events: published events, newest first. */
export const eventListResponseSchema = z.object({ items: z.array(eventSummarySchema) });

// ---------- Staff ----------

export const staffMemberSchema = z.object({
  user_id: uuidSchema,
  name: z.string(),
  email: z.string(),
  role: staffRoleSchema,
});
export type StaffMember = z.infer<typeof staffMemberSchema>;

export const addStaffBodySchema = z
  .object({ email: z.email('Enter an email address.').trim().toLowerCase(), role: staffRoleSchema })
  .strict();
export const removeStaffBodySchema = z
  .object({ user_id: uuidSchema, role: staffRoleSchema })
  .strict();

/** A role waiting for someone who hasn't signed in yet (R39). Claimed at their first sign-in. */
export const staffInviteSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  role: staffRoleSchema,
  created_at: isoDateTimeSchema,
});
export type StaffInvite = z.infer<typeof staffInviteSchema>;

/** GET, POST and DELETE /events/{id}/staff: the staff and the pending invitations. */
export const staffListSchema = z.object({
  items: z.array(staffMemberSchema),
  invites: z.array(staffInviteSchema),
});
export type StaffList = z.infer<typeof staffListSchema>;

export const staffInviteParamsSchema = z.object({ id: uuidSchema, inviteId: uuidSchema });

// ---------- Tracks, schedule, rubric, awards ----------

export const trackSchema = z.object({ id: uuidSchema, name: z.string(), description: z.string() });
export type Track = z.infer<typeof trackSchema>;
export const createTrackBodySchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a name.').max(80),
    description: z.string().max(1000).optional(),
  })
  .strict();
export const updateTrackBodySchema = createTrackBodySchema.partial();

export const scheduleItemSchema = z.object({
  id: uuidSchema,
  title: z.string(),
  starts_at: isoDateTimeSchema,
  ends_at: isoDateTimeSchema.nullable(),
  location: z.string().nullable(),
});
export type ScheduleItem = z.infer<typeof scheduleItemSchema>;
const scheduleFields = z
  .object({
    title: z.string().trim().min(1, 'Enter a title.').max(120),
    starts_at: isoDateTimeSchema,
    ends_at: isoDateTimeSchema.nullable(),
    location: z
      .string()
      .trim()
      .max(120)
      .transform((value) => (value === '' ? null : value))
      .nullable(),
  })
  .strict();
export const createScheduleItemBodySchema = scheduleFields
  .partial({ ends_at: true, location: true })
  .refine((item) => !item.ends_at || item.ends_at > item.starts_at, {
    path: ['ends_at'],
    message: 'Must be after the start.',
  });
export const updateScheduleItemBodySchema = scheduleFields.partial();

export const rubricCriterionSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  description: z.string(),
  max_score: z.number().int(),
  weight: z.number(),
  position: z.number().int(),
  is_tiebreaker: z.boolean(),
});
export type RubricCriterion = z.infer<typeof rubricCriterionSchema>;
const rubricFields = z
  .object({
    name: z.string().trim().min(1, 'Enter a name.').max(80),
    description: z.string().max(1000),
    max_score: z.number().int().min(1).max(100),
    weight: z.number().positive().max(100),
    position: z.number().int().min(0).max(1000),
    is_tiebreaker: z.boolean(),
  })
  .strict();
export const createRubricCriterionBodySchema = rubricFields.partial({
  description: true,
  weight: true,
  position: true,
  is_tiebreaker: true,
});
export const updateRubricCriterionBodySchema = rubricFields.partial();

export const awardSchema = z.object({
  id: uuidSchema,
  track_id: uuidSchema.nullable(),
  name: z.string(),
  rank: z.number().int().nullable(),
});
export type Award = z.infer<typeof awardSchema>;
const awardFields = z
  .object({
    name: z.string().trim().min(1, 'Enter a name.').max(80),
    track_id: uuidSchema.nullable(),
    rank: z.number().int().min(1).max(100).nullable(),
  })
  .strict();
export const createAwardBodySchema = awardFields.partial({ track_id: true, rank: true });
export const updateAwardBodySchema = awardFields.partial();

/** GET /events/{id}/setup: everything a participant or organizer sees about the event's structure. */
export const eventSetupSchema = z.object({
  tracks: z.array(trackSchema),
  schedule: z.array(scheduleItemSchema),
  rubric: z.array(rubricCriterionSchema),
  awards: z.array(awardSchema),
});
export type EventSetup = z.infer<typeof eventSetupSchema>;
