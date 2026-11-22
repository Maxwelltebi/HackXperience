import { parseIfMatch } from '@hx/core';
import { getMySubmission, getSql, saveSubmission, tx } from '@hx/db';
import { ApiError, IF_MATCH_HEADER, saveSubmissionBodySchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';
import { assertPublicRepo, differentRepo } from '@/lib/server/repo-check';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/events/{id}/teams/me/submission: the caller's team's submission, with the
 * `version` to send back in If-Match. Before the first save it is a blank draft at version 0.
 */
export const GET = handler({ event: {} }, async ({ access, userId }) => {
  return json(await getMySubmission(getSql(), access.event.id, userId));
});

/**
 * PUT /api/v1/events/{id}/teams/me/submission: save the whole draft. Needs `If-Match: <version>`.
 * 200 with the new version; 409 STALE_VERSION when a teammate saved first (details.current is
 * their version); 423 SUBMISSION_LOCKED after the deadline (DESIGN Step 4, Submission save).
 * Once submitted, a new GitHub link must be a public repository too (R37).
 */
export const PUT = handler(
  { event: {}, body: saveSubmissionBodySchema },
  async ({ request, access, userId, body }) => {
    const version = parseIfMatch(request.headers.get(IF_MATCH_HEADER));
    if (version === null) {
      throw ApiError.validation('Send the version you edited in the If-Match header.', {
        'If-Match': 'Required: the version from your last GET or save.',
      });
    }
    const current = await getMySubmission(getSql(), access.event.id, userId);
    if (current.status === 'submitted' && differentRepo(body.github_url, current.github_url)) {
      await assertPublicRepo(body.github_url);
    }
    return json(await tx((sql) => saveSubmission(sql, access.event.id, userId, version, body)));
  },
);
