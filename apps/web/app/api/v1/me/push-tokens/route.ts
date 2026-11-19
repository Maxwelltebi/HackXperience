import { getSql, upsertPushToken } from '@hx/db';
import { registerPushTokenBodySchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** POST /api/v1/me/push-tokens: register this device. Repeating it is harmless. */
export const POST = handler({ body: registerPushTokenBodySchema }, async ({ userId, body }) => {
  return json(await upsertPushToken(getSql(), userId, body), 201);
});
