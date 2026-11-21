import { getSql, hitRateLimit, joinTeam, tx, withTeamErrors } from '@hx/db';
import { joinTeamBodySchema, TEAM_JOIN_LIMIT_PER_MINUTE } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/events/{id}/teams/join {invite_code}: confirmed participants. 10 attempts per
 * person per minute, counted before the join's transaction so failed guesses count too.
 */
export const POST = handler(
  { event: {}, body: joinTeamBodySchema },
  async ({ access, userId, body }) => {
    await hitRateLimit(getSql(), `team_join:${userId}`, TEAM_JOIN_LIMIT_PER_MINUTE, 60);
    const team = await withTeamErrors(() =>
      tx((sql) => joinTeam(sql, access.event.id, userId, body.invite_code)),
    );
    return json(team);
  },
);
