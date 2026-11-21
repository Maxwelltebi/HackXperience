import { setDeleted, tx } from '@hx/db';
import { submissionParamsSchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { noContent } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** POST /api/v1/events/{id}/submissions/{sid}/restore: owner. Audited. */
export const POST = handler(
  { event: { permission: 'records.delete' }, params: submissionParamsSchema },
  async ({ access, params, userId }) => {
    await tx((sql) => setDeleted(sql, 'submission', access.event.id, params.sid, userId, false));
    return noContent();
  },
);
