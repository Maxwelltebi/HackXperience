import { getSql, getTeamFormation } from '@hx/db';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/events/{id}/team-formation: owner, admin (R36). Confirmed participants with no
 * team, with their skill ratings, and the organizers' current draft.
 */
export const GET = handler({ event: { permission: 'teams.form' } }, async ({ access }) => {
  return json(await getTeamFormation(getSql(), access.event.id));
});
