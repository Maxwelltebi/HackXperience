import { getMySubmission, getSql, submitSubmission, tx } from '@hx/db';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';
import { assertPublicRepo } from '@/lib/server/repo-check';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/events/{id}/teams/me/submission/submit: any member. Needs a title, a write-up,
 * at least team_size_min members (TEAM_TOO_SMALL otherwise), and a public GitHub repository if
 * there's a link (R37, checked before the transaction). Pressing it twice is harmless.
 */
export const POST = handler({ event: {} }, async ({ access, userId }) => {
  const current = await getMySubmission(getSql(), access.event.id, userId);
  await assertPublicRepo(current.github_url);
  return json(
    await tx((sql) =>
      submitSubmission(sql, access.event.id, userId, { checkedGithubUrl: current.github_url }),
    ),
  );
});
