import { createScheduleItemBodySchema } from '@hx/shared';
import { setupCollectionRoutes } from '@/lib/api/setup-routes';

export const dynamic = 'force-dynamic';

/** GET, POST /api/v1/events/{id}/schedule */
const routes = setupCollectionRoutes('schedule', createScheduleItemBodySchema);
export const GET = routes.GET;
export const POST = routes.POST;
