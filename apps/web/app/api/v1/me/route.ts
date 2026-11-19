import { getMe, getSql } from '@hx/db';
import { ApiError } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** GET /api/v1/me: the signed-in user's account and profile. */
export const GET = handler({}, async ({ userId }) => {
  const me = await getMe(getSql(), userId);
  if (!me) throw new ApiError('NOT_FOUND', 'Account not found.');
  return json(me);
});
