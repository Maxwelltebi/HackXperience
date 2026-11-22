import { cancelStaffInvite, tx } from '@hx/db';
import { staffInviteParamsSchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** DELETE /api/v1/events/{id}/staff/invites/{inviteId}: owner. Withdraws an invitation (R39). */
export const DELETE = handler(
  { event: { permission: 'staff.manage' }, params: staffInviteParamsSchema },
  async ({ access, userId, params }) => {
    return json(
      await tx((sql) => cancelStaffInvite(sql, access.event.id, userId, params.inviteId)),
    );
  },
);
