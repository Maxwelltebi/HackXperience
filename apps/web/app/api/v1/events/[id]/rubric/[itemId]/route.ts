import { updateRubricCriterionBodySchema } from '@hx/shared';
import { setupItemRoutes } from '@/lib/api/setup-routes';

export const dynamic = 'force-dynamic';

/** PATCH, DELETE /api/v1/events/{id}/rubric/{itemId} */
const routes = setupItemRoutes('rubric', updateRubricCriterionBodySchema);
export const PATCH = routes.PATCH;
export const DELETE = routes.DELETE;
