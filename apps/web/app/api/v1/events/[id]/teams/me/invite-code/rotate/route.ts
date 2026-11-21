import { getSql, hitRateLimit, rotateInviteCode, tx } from '@hx/db';
import { RATE_LIMITS_PER_MINUTE } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** POST /api/v1/events/{id}/teams/me/invite-code/rotate: any member. The old code stops working. */
export const POST = handler({ event: {} }, async ({ access, userId }) => {
  await hitRateLimit(getSql(), `invite_rotate:${userId}`, RATE_LIMITS_PER_MINUTE.inviteRotate, 60);
  return json(await tx((sql) => rotateInviteCode(sql, access.event.id, userId)));
});
