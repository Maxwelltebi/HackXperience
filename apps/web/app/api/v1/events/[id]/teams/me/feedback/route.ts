import { getSql, getTeamFeedback } from '@hx/db';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** GET /api/v1/events/{id}/teams/me/feedback: judges' comments, anonymized, once completed. */
export const GET = handler({ event: {} }, async ({ access, userId }) => {
  return json(await getTeamFeedback(getSql(), access.event.id, userId));
});
