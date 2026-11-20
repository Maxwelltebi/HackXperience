import { updateTrackBodySchema } from '@hx/shared';
import { setupItemRoutes } from '@/lib/api/setup-routes';

export const dynamic = 'force-dynamic';

/** PATCH, DELETE /api/v1/events/{id}/tracks/{itemId} */
const routes = setupItemRoutes('tracks', updateTrackBodySchema);
export const PATCH = routes.PATCH;
export const DELETE = routes.DELETE;
