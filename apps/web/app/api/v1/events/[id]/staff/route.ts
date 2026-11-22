import { addStaff, getSql, listStaffAndInvites, listStaffInvites, removeStaff, tx } from '@hx/db';
import { addStaffBodySchema, removeStaffBodySchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

const staffOnly = { permission: 'staff.manage' } as const;

/** GET /api/v1/events/{id}/staff: owner. The staff, and invitations not yet accepted. */
export const GET = handler({ event: staffOnly }, async ({ access }) => {
  return json(await listStaffAndInvites(getSql(), access.event.id));
});

/**
 * POST /api/v1/events/{id}/staff {email, role}: owner. Someone with an account gets the role and
 * an email; anyone else gets an invitation email, and the role is theirs at first sign-in (R39).
 */
export const POST = handler(
  { event: staffOnly, body: addStaffBodySchema },
  async ({ access, userId, body }) => {
    return json(await tx((sql) => addStaff(sql, access.event.id, userId, body.email, body.role)));
  },
);

/** DELETE /api/v1/events/{id}/staff {user_id, role}: owner. The last owner stays. */
export const DELETE = handler(
  { event: staffOnly, body: removeStaffBodySchema },
  async ({ access, userId, body }) => {
    const items = await tx((sql) =>
      removeStaff(sql, access.event.id, userId, body.user_id, body.role),
    );
    return json({ items, invites: await listStaffInvites(getSql(), access.event.id) });
  },
);
