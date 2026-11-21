import { autoGroupDraft, tx } from '@hx/db';
import { autoGroupBodySchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/events/{id}/team-formation/auto {team_size, version}: owner, admin (R36).
 * Balanced teams from everyone without a team, saved as the draft. Nobody else sees it yet.
 */
export const POST = handler(
  { event: { permission: 'teams.form' }, body: autoGroupBodySchema },
  async ({ access, userId, body }) => {
    return json(
      await tx((sql) => autoGroupDraft(sql, access.event.id, userId, body.team_size, body.version)),
    );
  },
);
