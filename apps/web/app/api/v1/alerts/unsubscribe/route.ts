import { getSql, unsubscribeFromAlerts } from '@hx/db';
import { alertUnsubscribeBodySchema, ApiError, type AlertUnsubscribeResult } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/alerts/unsubscribe: stop event alerts (R42), with the token from the link in
 * every alert email. A POST, not the link itself, so mail scanners that open links can't
 * unsubscribe people.
 */
export const POST = handler(
  { auth: 'none', body: alertUnsubscribeBodySchema },
  async ({ body }) => {
    if (!(await unsubscribeFromAlerts(getSql(), body.token))) {
      throw new ApiError('NOT_FOUND', "This unsubscribe link doesn't work any more.");
    }
    const result: AlertUnsubscribeResult = { unsubscribed: true };
    return json(result);
  },
);
