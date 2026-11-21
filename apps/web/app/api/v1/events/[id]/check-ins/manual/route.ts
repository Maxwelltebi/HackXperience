import { manualCheckIn, tx } from '@hx/db';
import { manualCheckInBodySchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** POST /api/v1/events/{id}/check-ins/manual {user_id}: owners and admins. Audited. */
export const POST = handler(
  { event: { permission: 'checkins.manual' }, body: manualCheckInBodySchema },
  async ({ access, userId, body }) => {
    const result = await tx((sql) => manualCheckIn(sql, access.event.id, userId, body.user_id));
    return json(result, 201);
  },
);
