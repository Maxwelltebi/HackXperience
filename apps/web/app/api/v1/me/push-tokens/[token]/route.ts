import { deletePushToken, getSql } from '@hx/db';
import { pushTokenParamsSchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { noContent } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/v1/me/push-tokens/{token}: forget this device (on sign-out).
 * URL-encode the token: Expo tokens contain [ and ].
 */
export const DELETE = handler({ params: pushTokenParamsSchema }, async ({ userId, params }) => {
  await deletePushToken(getSql(), userId, params.token);
  return noContent();
});
