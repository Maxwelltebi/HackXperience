import { updateAwardBodySchema } from '@hx/shared';
import { setupItemRoutes } from '@/lib/api/setup-routes';

export const dynamic = 'force-dynamic';

/** PATCH, DELETE /api/v1/events/{id}/awards/{itemId} */
const routes = setupItemRoutes('awards', updateAwardBodySchema);
export const PATCH = routes.PATCH;
export const DELETE = routes.DELETE;
