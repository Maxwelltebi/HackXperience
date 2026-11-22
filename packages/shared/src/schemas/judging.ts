import { z } from 'zod';
import { SHA_STATES } from '../constants';
import { isoDateTimeSchema, uuidSchema } from './base';
import { rubricCriterionSchema } from './events';
import { projectImageSchema } from './submissions';

// ---------- Assignment ----------

/** POST /events/{id}/judging/assign. Running it again keeps scored assignments and tops up. */
export const assignJudgesBodySchema = z
  .object({
    judges_per_submission: z.number().int().min(1).max(10).default(3),
    /** Same seed, same judges and submissions: same assignment. A new one is made if missing. */
    seed: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

export const assignJudgesResultSchema = z.object({
  seed: z.string(),
  judges: z.number().int(),
  submissions: z.number().int(),
  assignments: z.number().int(),
  /** Submissions with fewer judges than asked for (too few judges without conflicts). */
  short: z.array(z.object({ submission_id: uuidSchema, judges: z.number().int() })),
});
export type AssignJudgesResult = z.infer<typeof assignJudgesResultSchema>;

// ---------- A judge's queue and scoring ----------

export const judgeQueueItemSchema = z.object({
  submission_id: uuidSchema,
  title: z.string(),
  tagline: z.string(),
  team_name: z.string(),
  track_ids: z.array(uuidSchema),
  /** Every criterion scored by this judge. */
  scored: z.boolean(),
});
export type JudgeQueueItem = z.infer<typeof judgeQueueItemSchema>;

/** GET /events/{id}/judging/me */
export const judgeQueueSchema = z.object({
  items: z.array(judgeQueueItemSchema),
  scored: z.number().int(),
  total: z.number().int(),
  /** Scores can be entered only while the event is judging. */
  judging_open: z.boolean(),
});
export type JudgeQueue = z.infer<typeof judgeQueueSchema>;

export const myScoreSchema = z.object({
  criterion_id: uuidSchema,
  score: z.number(),
  comment: z.string().nullable(),
});
export type MyScore = z.infer<typeof myScoreSchema>;

/** GET /events/{id}/submissions/{sid}: an assigned judge, or an owner or admin. */
export const judgingSubmissionSchema = z.object({
  id: uuidSchema,
  event_id: uuidSchema,
  team_id: uuidSchema,
  team_name: z.string(),
  title: z.string(),
  tagline: z.string(),
  write_up: z.string(),
  github_url: z.string().nullable(),
  youtube_url: z.string().nullable(),
  demo_url: z.string().nullable(),
  track_ids: z.array(uuidSchema),
  status: z.enum(['draft', 'submitted']),
  auto_submitted: z.boolean(),
  below_min_size: z.boolean(),
  locked_commit_sha: z.string().nullable(),
  sha_status: z.enum(SHA_STATES),
  images: z.array(projectImageSchema),
  criteria: z.array(rubricCriterionSchema),
  /** The caller's own scores; empty for organizers who are not judging it. */
  my_scores: z.array(myScoreSchema),
  judging_open: z.boolean(),
});
export type JudgingSubmission = z.infer<typeof judgingSubmissionSchema>;

/** PUT /events/{id}/submissions/{sid}/scores/me: every criterion at once. */
export const putScoresBodySchema = z
  .object({
    scores: z
      .array(
        z
          .object({
            criterion_id: uuidSchema,
            score: z.number().finite().min(0, 'Scores start at 0.'),
            comment: z
              .string()
              .trim()
              .max(2000)
              .nullable()
              .optional()
              .transform((v) => (v ? v : null)),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();
export type PutScoresBody = z.output<typeof putScoresBodySchema>;

// ---------- Standings (organizers) ----------

export const standingRowSchema = z.object({
  submission_id: uuidSchema,
  team_id: uuidSchema,
  team_name: z.string(),
  title: z.string(),
  track_ids: z.array(uuidSchema),
  rank: z.number().int().nullable(),
  tied: z.boolean(),
  /** Average weighted total, 0 to 100. */
  raw: z.number().nullable(),
  /** Average z-score across judges: the ranking score. */
  normalized: z.number().nullable(),
  tiebreaker: z.number().nullable(),
  judges_scored: z.number().int(),
  judges_assigned: z.number().int(),
  below_min_size: z.boolean(),
});
export type StandingRow = z.infer<typeof standingRowSchema>;

export const judgeProgressSchema = z.object({
  judge_id: uuidSchema,
  name: z.string(),
  scored: z.number().int(),
  assigned: z.number().int(),
  mean: z.number().nullable(),
  spread: z.number().nullable(),
  pooled: z.boolean(),
});
export type JudgeProgress = z.infer<typeof judgeProgressSchema>;

/** GET /events/{id}/judging/standings: raw and normalized side by side, plus progress. */
export const standingsSchema = z.object({
  overall: z.array(standingRowSchema),
  tracks: z.array(
    z.object({ track_id: uuidSchema, track_name: z.string(), rows: z.array(standingRowSchema) }),
  ),
  judges: z.array(judgeProgressSchema),
  progress: z.object({ scored: z.number().int(), expected: z.number().int() }),
  tiebreaker: z.string().nullable(),
});
export type Standings = z.infer<typeof standingsSchema>;

// ---------- Awards ----------

/** POST /events/{id}/awards/{aid}/winners: replaces the award's winners (a tie may share one). */
export const setWinnersBodySchema = z.object({ team_ids: z.array(uuidSchema).max(10) }).strict();

export const winnerSchema = z.object({
  team_id: uuidSchema,
  team_name: z.string(),
  submission_id: uuidSchema.nullable(),
  title: z.string(),
  tagline: z.string(),
  members: z.array(z.object({ user_id: uuidSchema, name: z.string() })),
});
export type Winner = z.infer<typeof winnerSchema>;

export const awardResultSchema = z.object({
  award_id: uuidSchema,
  name: z.string(),
  track_id: uuidSchema.nullable(),
  track_name: z.string().nullable(),
  rank: z.number().int().nullable(),
  winners: z.array(winnerSchema),
});
export type AwardResult = z.infer<typeof awardResultSchema>;

/** GET /events/{id}/results: anyone, once completed. Read from results_snapshot. */
export const resultsSchema = z.object({
  event_id: uuidSchema,
  published_at: isoDateTimeSchema,
  awards: z.array(awardResultSchema),
  projects: z.number().int(),
});
export type Results = z.infer<typeof resultsSchema>;

/**
 * What results_snapshot holds: the public results plus the standings at publication, kept for
 * organizers. Later score edits never change it (build plan Phase 5 item 5).
 */
export const resultsSnapshotSchema = resultsSchema.extend({
  version: z.literal(1),
  standings: standingsSchema,
});
export type ResultsSnapshot = z.infer<typeof resultsSnapshotSchema>;

// ---------- Gallery and feedback ----------

export const galleryItemSchema = z.object({
  submission_id: uuidSchema,
  team_id: uuidSchema,
  team_name: z.string(),
  title: z.string(),
  tagline: z.string(),
  write_up: z.string(),
  github_url: z.string().nullable(),
  youtube_url: z.string().nullable(),
  demo_url: z.string().nullable(),
  locked_commit_sha: z.string().nullable(),
  track_ids: z.array(uuidSchema),
  members: z.array(z.object({ user_id: uuidSchema, name: z.string() })),
  awards: z.array(z.string()),
  /** In order: the first is the cover (R41). */
  images: z.array(projectImageSchema),
});
export type GalleryItem = z.infer<typeof galleryItemSchema>;

/** GET /events/{id}/submissions: admin any time; anyone once completed. */
export const galleryQuerySchema = z.object({
  cursor: z.string().max(400).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export const galleryPageSchema = z.object({
  items: z.array(galleryItemSchema),
  next_cursor: z.string().nullable(),
});
export type GalleryPage = z.infer<typeof galleryPageSchema>;

/** GET /events/{id}/teams/me/feedback: judge comments with judges anonymized, once completed. */
export const feedbackSchema = z.object({
  items: z.array(
    z.object({
      /** "Judge 1", "Judge 2": stable per submission, never the judge's name. */
      judge: z.string(),
      criterion_name: z.string(),
      comment: z.string(),
    }),
  ),
});
export type Feedback = z.infer<typeof feedbackSchema>;

export const submissionParamsSchema = z.object({ id: uuidSchema, sid: uuidSchema });
