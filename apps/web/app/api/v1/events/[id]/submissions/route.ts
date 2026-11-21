import { getSql, listGallery } from '@hx/db';
import { ApiError, can, galleryQuerySchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/events/{id}/submissions?cursor=: the project gallery. Owners and admins any time;
 * everyone once results are published (DESIGN Step 4).
 */
export const GET = handler(
  { auth: 'optional', event: {}, query: galleryQuerySchema },
  async ({ access, query }) => {
    if (access.event.status !== 'completed' && !can(access.roles, 'submissions.read_all')) {
      throw new ApiError('RESULTS_NOT_PUBLISHED', 'The gallery opens when results are published.');
    }
    return json(await listGallery(getSql(), access.event.id, query));
  },
);
