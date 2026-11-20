import { getEventSetup, getSql } from '@hx/db';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** GET /api/v1/events/{id}/setup: tracks, schedule, rubric and awards in one request. */
export const GET = handler({ auth: 'optional', event: {} }, async ({ access }) => {
  return json(await getEventSetup(getSql(), access.event.id));
});
