import { createAwardBodySchema } from '@hx/shared';
import { setupCollectionRoutes } from '@/lib/api/setup-routes';

export const dynamic = 'force-dynamic';

/** GET, POST /api/v1/events/{id}/awards */
const routes = setupCollectionRoutes('awards', createAwardBodySchema);
export const GET = routes.GET;
export const POST = routes.POST;
