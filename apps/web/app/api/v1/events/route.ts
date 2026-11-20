import { getSql, listPublicEvents, toEventSummary } from '@hx/db';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** GET /api/v1/events: published events, upcoming first. */
export const GET = handler({ auth: 'none' }, async () => {
  const rows = await listPublicEvents(getSql());
  return json({ items: rows.map(toEventSummary) });
});
