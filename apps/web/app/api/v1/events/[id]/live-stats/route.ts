import { getSql, liveStats } from '@hx/db';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** GET /api/v1/events/{id}/live-stats: the staff dashboard counts (owner, admin). */
export const GET = handler({ event: { permission: 'live.view' } }, async ({ access }) => {
  return json(await liveStats(getSql(), access.event.id));
});
