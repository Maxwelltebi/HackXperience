import { deleteEvent, toEvent, tx, updateEvent } from '@hx/db';
import { updateEventBodySchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json, noContent } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** GET /api/v1/events/{id}: anyone for published events; owners and admins for drafts. */
export const GET = handler({ auth: 'optional', event: {} }, async ({ access }) => {
  return json(toEvent(access.event));
});

/** PATCH /api/v1/events/{id}: owner, admin. Status changes use POST /status. */
export const PATCH = handler(
  { event: { permission: 'event.edit' }, body: updateEventBodySchema },
  async ({ access, userId, body }) => {
    return json(await tx((sql) => updateEvent(sql, access.event.id, userId, body)));
  },
);

/** DELETE /api/v1/events/{id}: owner. A soft delete, audited; POST /restore undoes it. */
export const DELETE = handler(
  { event: { permission: 'records.delete' } },
  async ({ access, userId }) => {
    await tx((sql) => deleteEvent(sql, access.event.id, userId));
    return noContent();
  },
);
