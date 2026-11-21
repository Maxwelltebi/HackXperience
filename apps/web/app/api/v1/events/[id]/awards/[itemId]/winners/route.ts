import { setAwardWinners, tx } from '@hx/db';
import { eventItemParamsSchema, setWinnersBodySchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/events/{id}/awards/{aid}/winners {team_ids}: owner, admin, while judging.
 * Replaces the award's winners. Audited.
 */
export const POST = handler(
  {
    event: { permission: 'judging.manage' },
    params: eventItemParamsSchema,
    body: setWinnersBodySchema,
  },
  async ({ access, params, userId, body }) => {
    const awards = await tx((sql) =>
      setAwardWinners(sql, access.event.id, params.itemId, userId, body.team_ids),
    );
    return json({ items: awards });
  },
);
