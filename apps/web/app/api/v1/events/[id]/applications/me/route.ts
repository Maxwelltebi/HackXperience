import { getMyApplication, getSql } from '@hx/db';
import { ApiError } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** GET /api/v1/events/{id}/applications/me: the caller's own application. */
export const GET = handler({ event: {} }, async ({ access, userId }) => {
  const application = await getMyApplication(getSql(), access.event.id, userId);
  if (!application) throw new ApiError('NOT_FOUND', "You haven't applied to this event.");
  return json(application);
});
