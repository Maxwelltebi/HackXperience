import { getSql, listTeamMentorRequests } from '@hx/db';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** GET /api/v1/events/{id}/teams/me/mentor-requests: the caller's team's requests. */
export const GET = handler({ event: {} }, async ({ access, userId }) => {
  return json(await listTeamMentorRequests(getSql(), access.event.id, userId));
});
