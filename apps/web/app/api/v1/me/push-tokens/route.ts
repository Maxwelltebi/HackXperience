import { deletePushToken, getSql, upsertPushToken } from '@hx/db';
import { deletePushTokenBodySchema, registerPushTokenBodySchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json, noContent } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** POST /api/v1/me/push-tokens: register this device. Repeating it is harmless. */
export const POST = handler({ body: registerPushTokenBodySchema }, async ({ userId, body }) => {
  return json(await upsertPushToken(getSql(), userId, body), 201);
});

/** DELETE /api/v1/me/push-tokens: forget this device (on sign-out). Body: { token }. */
export const DELETE = handler({ body: deletePushTokenBodySchema }, async ({ userId, body }) => {
  await deletePushToken(getSql(), userId, body.token);
  return noContent();
});
