import { getResults, getSql } from '@hx/db';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** GET /api/v1/events/{id}/results: anyone once completed, read from the frozen snapshot. */
export const GET = handler({ auth: 'optional', event: {} }, async ({ access }) => {
  return json(await getResults(getSql(), access.event.id));
});
