import { submitSubmission, tx } from '@hx/db';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/events/{id}/teams/me/submission/submit: any member. Needs a title, a write-up,
 * and at least team_size_min members (TEAM_TOO_SMALL otherwise). Pressing it twice is harmless.
 */
export const POST = handler({ event: {} }, async ({ access, userId }) => {
  return json(await tx((sql) => submitSubmission(sql, access.event.id, userId)));
});
