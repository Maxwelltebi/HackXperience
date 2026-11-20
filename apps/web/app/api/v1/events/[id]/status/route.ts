import { changeEventStatus, tx } from '@hx/db';
import { eventStatusBodySchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** POST /api/v1/events/{id}/status: owner, admin. Allowed transitions only; audited. */
export const POST = handler(
  { event: { permission: 'event.edit' }, body: eventStatusBodySchema },
  async ({ access, userId, body }) => {
    return json(await tx((sql) => changeEventStatus(sql, access.event.id, userId, body.status)));
  },
);
