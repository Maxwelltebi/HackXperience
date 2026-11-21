import { removeTeamMember, tx } from '@hx/db';
import { teamParamsSchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** DELETE /api/v1/events/{id}/teams/me/members/{userId}: the team owner. Audited. */
export const DELETE = handler(
  { event: {}, params: teamParamsSchema },
  async ({ access, userId, params }) => {
    const team = await tx((sql) => removeTeamMember(sql, access.event.id, userId, params.userId));
    return json(team);
  },
);
