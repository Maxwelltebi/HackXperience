import { restoreEvent, tx } from '@hx/db';
import { idParamsSchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { noContent } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/events/{id}/restore: owner. Deleted events are invisible to the event loader,
 * so the owner check happens on the deleted row itself. Audited.
 */
export const POST = handler({ params: idParamsSchema }, async ({ params, userId }) => {
  await tx((sql) => restoreEvent(sql, params.id, userId));
  return noContent();
});
