import { leaveTeam, tx } from '@hx/db';
import { handler } from '@/lib/api/handler';
import { noContent } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** POST /api/v1/events/{id}/teams/me/leave: any member, until the submission deadline. */
export const POST = handler({ event: {} }, async ({ access, userId }) => {
  await tx((sql) => leaveTeam(sql, access.event.id, userId));
  return noContent();
});
