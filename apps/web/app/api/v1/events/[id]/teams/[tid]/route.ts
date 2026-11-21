import { setDeleted, tx } from '@hx/db';
import { z } from 'zod';
import { handler } from '@/lib/api/handler';
import { noContent } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** DELETE /api/v1/events/{id}/teams/{tid}: owner. Soft delete, audited. */
export const DELETE = handler(
  { event: { permission: 'records.delete' }, params: z.object({ id: z.uuid(), tid: z.uuid() }) },
  async ({ access, params, userId }) => {
    await tx((sql) => setDeleted(sql, 'team', access.event.id, params.tid, userId, true));
    return noContent();
  },
);
