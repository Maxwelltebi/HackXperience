import { publishTeamDraft, tx } from '@hx/db';
import { publishDraftBodySchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/events/{id}/team-formation/publish {version}: owner, admin (R36). Creates the
 * draft's teams, emails each member and audits each team. Refused after the deadline.
 */
export const POST = handler(
  { event: { permission: 'teams.form' }, body: publishDraftBodySchema },
  async ({ access, userId, body }) => {
    return json(await tx((sql) => publishTeamDraft(sql, access.event.id, userId, body.version)));
  },
);
