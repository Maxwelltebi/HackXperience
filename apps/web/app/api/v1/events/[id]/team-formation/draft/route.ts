import { discardTeamDraft, saveTeamDraft, tx } from '@hx/db';
import { saveDraftBodySchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** PUT /api/v1/events/{id}/team-formation/draft {version, teams}: owner, admin (R36). */
export const PUT = handler(
  { event: { permission: 'teams.form' }, body: saveDraftBodySchema },
  async ({ access, userId, body }) => {
    return json(
      await tx((sql) => saveTeamDraft(sql, access.event.id, userId, body.version, body.teams)),
    );
  },
);

/** DELETE /api/v1/events/{id}/team-formation/draft: owner, admin. Throws the draft away. */
export const DELETE = handler({ event: { permission: 'teams.form' } }, async ({ access }) => {
  return json(await tx((sql) => discardTeamDraft(sql, access.event.id)));
});
