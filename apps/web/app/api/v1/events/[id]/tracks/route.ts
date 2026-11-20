import { createTrackBodySchema } from '@hx/shared';
import { setupCollectionRoutes } from '@/lib/api/setup-routes';

export const dynamic = 'force-dynamic';

/** GET, POST /api/v1/events/{id}/tracks */
const routes = setupCollectionRoutes('tracks', createTrackBodySchema);
export const GET = routes.GET;
export const POST = routes.POST;
