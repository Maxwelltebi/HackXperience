import { getSql, hitRateLimit, subscribeToAlerts } from '@hx/db';
import { alertSignupBodySchema, RATE_LIMITS_PER_MINUTE, type AlertSignupResult } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';
import { clientIp } from '@/lib/server/client-ip';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/alerts: sign an email address up for event alerts (R42). No account and no
 * confirmation step. Rate-limited per IP address. A filled-in `website` field means a bot: the
 * answer is the same, but nothing is stored. The answer never says whether the address was
 * already signed up.
 */
export const POST = handler(
  { auth: 'none', body: alertSignupBodySchema },
  async ({ request, body }) => {
    const sql = getSql();
    await hitRateLimit(sql, `alerts:${clientIp(request)}`, RATE_LIMITS_PER_MINUTE.alertSignup, 60);
    if (!body.website) await subscribeToAlerts(sql, body.email);
    const result: AlertSignupResult = { subscribed: true };
    return json(result);
  },
);
