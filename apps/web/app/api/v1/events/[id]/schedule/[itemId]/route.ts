import { updateScheduleItemBodySchema } from '@hx/shared';
import { setupItemRoutes } from '@/lib/api/setup-routes';

export const dynamic = 'force-dynamic';

/** PATCH, DELETE /api/v1/events/{id}/schedule/{itemId} */
const routes = setupItemRoutes('schedule', updateScheduleItemBodySchema);
export const PATCH = routes.PATCH;
export const DELETE = routes.DELETE;
