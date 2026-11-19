import { getSql, pingDatabase } from '@hx/db';
import { ApiError, type HealthResponse } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** GET /api/v1/health: runs `select 1`. The nightly workflow calls it to keep the database awake. */
export const GET = handler({ auth: 'none' }, async () => {
  try {
    await pingDatabase(getSql());
  } catch {
    throw new ApiError('SERVICE_UNAVAILABLE', 'The database is not reachable.');
  }
  const body: HealthResponse = { status: 'ok', database: 'ok' };
  return json(body);
});
