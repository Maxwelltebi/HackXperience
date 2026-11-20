import { addStaff, getSql, listStaff, removeStaff, tx } from '@hx/db';
import { addStaffBodySchema, removeStaffBodySchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

const staffOnly = { permission: 'staff.manage' } as const;

/** GET /api/v1/events/{id}/staff: owner. */
export const GET = handler({ event: staffOnly }, async ({ access }) => {
  return json({ items: await listStaff(getSql(), access.event.id) });
});

/** POST /api/v1/events/{id}/staff {email, role}: owner. The person must have signed in once. */
export const POST = handler(
  { event: staffOnly, body: addStaffBodySchema },
  async ({ access, userId, body }) => {
    const items = await tx((sql) => addStaff(sql, access.event.id, userId, body.email, body.role));
    return json({ items });
  },
);

/** DELETE /api/v1/events/{id}/staff {user_id, role}: owner. The last owner stays. */
export const DELETE = handler(
  { event: staffOnly, body: removeStaffBodySchema },
  async ({ access, userId, body }) => {
    const items = await tx((sql) =>
      removeStaff(sql, access.event.id, userId, body.user_id, body.role),
    );
    return json({ items });
  },
);
