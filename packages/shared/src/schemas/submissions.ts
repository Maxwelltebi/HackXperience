import { z } from 'zod';
import { SHA_STATES, SUBMISSION_LIMITS, SUBMISSION_STATUSES } from '../constants';
import { parseDemoLink, parseGithubLink, parseYoutubeLink, type LinkResult } from '../links';
import { isoDateTimeSchema, uuidSchema } from './base';

/**
 * An optional link field: empty means no link (null); anything else must pass `parse` and
 * is stored in its canonical form.
 */
function linkField(parse: (raw: string) => LinkResult) {
  return z
    .string()
    .nullable()
    .optional()
    .transform((value, ctx) => {
      const text = value?.trim() ?? '';
      if (text === '') return null;
      const result = parse(text);
      if (!result.ok) {
        ctx.addIssue({ code: 'custom', message: result.message });
        return z.NEVER;
      }
      return result.url;
    });
}

/**
 * PUT /events/{id}/teams/me/submission, with the `If-Match` header holding the version the
 * edit started from. The whole draft is sent each time. Drafts may be incomplete; Submit
 * checks that a title and write-up are there.
 */
export const saveSubmissionBodySchema = z
  .object({
    title: z.string().trim().max(SUBMISSION_LIMITS.title).default(''),
    tagline: z.string().trim().max(SUBMISSION_LIMITS.tagline).default(''),
    write_up: z.string().max(SUBMISSION_LIMITS.writeUp).default(''),
    github_url: linkField(parseGithubLink),
    youtube_url: linkField(parseYoutubeLink),
    demo_url: linkField(parseDemoLink),
    track_ids: z.array(uuidSchema).max(20).default([]),
  })
  .strict();
export type SaveSubmissionBody = z.output<typeof saveSubmissionBodySchema>;

/**
 * The team's submission. Before the first save there is no row: `id` is null and `version`
 * is 0, and the first PUT sends `If-Match: 0`.
 */
export const submissionSchema = z.object({
  id: uuidSchema.nullable(),
  event_id: uuidSchema,
  team_id: uuidSchema,
  title: z.string(),
  tagline: z.string(),
  write_up: z.string(),
  github_url: z.string().nullable(),
  youtube_url: z.string().nullable(),
  demo_url: z.string().nullable(),
  track_ids: z.array(uuidSchema),
  status: z.enum(SUBMISSION_STATUSES),
  submitted_at: isoDateTimeSchema.nullable(),
  auto_submitted: z.boolean(),
  below_min_size: z.boolean(),
  version: z.number().int(),
  locked_commit_sha: z.string().nullable(),
  sha_status: z.enum(SHA_STATES),
  sha_fetched_at: isoDateTimeSchema.nullable(),
  updated_at: isoDateTimeSchema.nullable(),
});
export type Submission = z.infer<typeof submissionSchema>;

/** POST /events/{id}/submissions/reopen: owner only, after an outage (DESIGN Step 7). */
export const reopenSubmissionsBodySchema = z
  .object({ submission_deadline: isoDateTimeSchema })
  .strict();

export const reopenSubmissionsResultSchema = z.object({
  submission_deadline: isoDateTimeSchema,
  submissions_locked_at: isoDateTimeSchema.nullable(),
});
export type ReopenSubmissionsResult = z.infer<typeof reopenSubmissionsResultSchema>;

/** Counts on the organizer overview. */
export const submissionCountsSchema = z.object({
  teams: z.number().int(),
  drafts: z.number().int(),
  submitted: z.number().int(),
});
export type SubmissionCounts = z.infer<typeof submissionCountsSchema>;

/** GET /github/repo?url=: whether a GitHub link's repository is public (R37). */
export const repoCheckQuerySchema = z.object({ url: z.string().trim().min(1).max(500) });
export const repoCheckSchema = z.object({
  /** unknown: GitHub couldn't be asked. invalid: not a link to a repository. */
  visibility: z.enum(['public', 'private', 'unknown', 'invalid']),
});
export type RepoCheck = z.infer<typeof repoCheckSchema>;
