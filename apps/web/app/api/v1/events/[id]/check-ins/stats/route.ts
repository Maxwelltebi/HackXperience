import { checkInStats, getSql } from '@hx/db';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** GET /api/v1/events/{id}/check-ins/stats: "214 of 300 confirmed checked in". */
export const GET = handler({ event: { permission: 'checkins.scan' } }, async ({ access }) => {
  return json(await checkInStats(getSql(), access.event.id));
});
