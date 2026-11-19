import { tx, updateProfile } from '@hx/db';
import { ApiError, patchProfileBodySchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** PATCH /api/v1/me/profile: update any of name, profile fields, timezone, email reminders. */
export const PATCH = handler({ body: patchProfileBodySchema }, async ({ userId, body }) => {
  const me = await tx((sql) => updateProfile(sql, userId, body));
  if (!me) throw new ApiError('NOT_FOUND', 'Account not found.');
  return json(me);
});
