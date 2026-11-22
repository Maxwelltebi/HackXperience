import { getSql, hitRateLimit } from '@hx/db';
import {
  githubRepoOf,
  RATE_LIMITS_PER_MINUTE,
  repoCheckQuerySchema,
  type RepoCheck,
} from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';
import { repoVisibility } from '@/lib/server/github';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/github/repo?url=: any signed-in person. Whether the repository is public, so the
 * submission editor can say so as soon as the link is entered (R37). Rate-limited per person.
 */
export const GET = handler({ query: repoCheckQuerySchema }, async ({ userId, query }) => {
  await hitRateLimit(getSql(), `repo-check:${userId}`, RATE_LIMITS_PER_MINUTE.repoCheck, 60);
  const repo = githubRepoOf(query.url);
  const result: RepoCheck = { visibility: repo ? await repoVisibility(repo) : 'invalid' };
  return json(result);
});
