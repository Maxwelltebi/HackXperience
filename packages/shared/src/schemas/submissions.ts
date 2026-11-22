import { z } from 'zod';
import { PROJECT_IMAGES, SHA_STATES, SUBMISSION_LIMITS, SUBMISSION_STATUSES } from '../constants';
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

// ---------- Project images (R41) ----------

/** One image on a team's project. Its URL is built from `path` (projectImageUrl). */
export const projectImageSchema = z.object({
  id: uuidSchema,
  path: z.string(),
  caption: z.string(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
});
export type ProjectImage = z.infer<typeof projectImageSchema>;

export const projectImageListSchema = z.object({ items: z.array(projectImageSchema) });
export type ProjectImageList = z.infer<typeof projectImageListSchema>;

/** POST /events/{id}/teams/me/images/upload: asks for a one-time upload link. */
export const imageUploadBodySchema = z
  .object({
    content_type: z.enum(PROJECT_IMAGES.types, { error: 'Use a PNG, JPEG or WebP image.' }),
    size: z.number().int().min(1).max(PROJECT_IMAGES.maxBytes, 'Images can be up to 5 MB.'),
  })
  .strict();

export const imageUploadSchema = z.object({
  path: z.string(),
  token: z.string(),
});
export type ImageUpload = z.infer<typeof imageUploadSchema>;

const dimension = z.number().int().min(1).max(20_000).nullable();

/** POST /events/{id}/teams/me/images: registers an uploaded image. */
export const addImageBodySchema = z
  .object({
    path: z.string().min(1).max(300),
    caption: z.string().trim().max(PROJECT_IMAGES.captionMax).default(''),
    width: dimension,
    height: dimension,
  })
  .strict();

/** PUT /events/{id}/teams/me/images: the order (first is the cover) and the captions. */
export const arrangeImagesBodySchema = z
  .object({
    images: z
      .array(
        z
          .object({
            id: uuidSchema,
            caption: z.string().trim().max(PROJECT_IMAGES.captionMax),
          })
          .strict(),
      )
      .max(PROJECT_IMAGES.max),
  })
  .strict();

export const imageParamsSchema = z.object({ id: uuidSchema, imageId: uuidSchema });
