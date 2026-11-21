import { getSql, runTick } from '@hx/db';
import { ApiError } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';
import { pushDeps } from '@/lib/server/expo';
import { commitFetcher } from '@/lib/server/github';
import { outboxDeps } from '@/lib/server/ses';
import { secretMatches, TICK_SECRET_HEADER } from '@/lib/server/secrets';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/internal/tick, called every minute by pg_cron (migration 0004_cron).
 * Checks TICK_SECRET before anything else (Agent rule 18), then runs the tick steps.
 */
export const POST = handler({ auth: 'none' }, async ({ request }) => {
  if (!secretMatches(request.headers.get(TICK_SECRET_HEADER), process.env.TICK_SECRET)) {
    throw new ApiError('UNAUTHENTICATED', 'Wrong or missing tick secret.');
  }
  return json(
    await runTick(getSql(), {
      outbox: outboxDeps(),
      fetchCommit: commitFetcher(),
      push: pushDeps(),
    }),
  );
});
