import { checkInByTicket, tx } from '@hx/db';
import { scanBodySchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/events/{id}/check-ins {ticket_code}: volunteers, admins, owners. Online only.
 * A second scan returns 409 ALREADY_CHECKED_IN with details.checked_in_at.
 */
export const POST = handler(
  { event: { permission: 'checkins.scan' }, body: scanBodySchema },
  async ({ access, userId, body }) => {
    const result = await tx((sql) =>
      checkInByTicket(sql, access.event.id, userId, body.ticket_code),
    );
    return json(result, 201);
  },
);
