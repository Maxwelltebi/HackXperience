import { getMyTeam, getSql, tx, updateTeam } from '@hx/db';
import { ApiError, updateTeamBodySchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** GET /api/v1/events/{id}/teams/me: the caller's team, its members and invite code. */
export const GET = handler({ event: {} }, async ({ access, userId }) => {
  const team = await getMyTeam(getSql(), access.event.id, userId);
  if (!team) throw new ApiError('NOT_ON_TEAM', 'You are not on a team at this event.');
  return json(team);
});

/** PATCH /api/v1/events/{id}/teams/me: team name and find-a-team board fields. Any member. */
export const PATCH = handler(
  { event: {}, body: updateTeamBodySchema },
  async ({ access, userId, body }) => {
    return json(await tx((sql) => updateTeam(sql, access.event.id, userId, body)));
  },
);
