import { getSql, searchAttendees } from '@hx/db';
import { attendeeSearchQuerySchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** GET /api/v1/events/{id}/check-ins/search?q=: owners and admins, for manual check-in. */
export const GET = handler(
  { event: { permission: 'checkins.manual' }, query: attendeeSearchQuerySchema },
  async ({ access, query }) => {
    return json({ items: await searchAttendees(getSql(), access.event.id, query.q) });
  },
);
