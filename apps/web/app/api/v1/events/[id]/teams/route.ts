import { createTeam, getSql, listOpenTeams, requireConfirmed, tx, withTeamErrors } from '@hx/db';
import { can, createTeamBodySchema } from '@hx/shared';
import { z } from 'zod';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/events/{id}/teams {name}: confirmed participants not on a team. Accepts a
 * client-generated id (body `id` or Idempotency-Key), so a retry returns the same team.
 */
export const POST = handler(
  { event: {}, clientId: true, body: createTeamBodySchema },
  async ({ access, userId, id, body }) => {
    const team = await withTeamErrors(() =>
      tx((sql) => createTeam(sql, access.event.id, userId, id, body.name)),
    );
    return json(team, 201);
  },
);

/**
 * GET /api/v1/events/{id}/teams?open=true: the find-a-team board, for confirmed participants
 * and organizers. Never includes invite codes.
 */
export const GET = handler(
  { event: {}, query: z.object({ open: z.enum(['true']).optional() }) },
  async ({ access, userId }) => {
    const sql = getSql();
    if (!can(access.roles, 'event.view_staff'))
      await requireConfirmed(sql, access.event.id, userId);
    return json({ items: await listOpenTeams(sql, access.event.id) });
  },
);
