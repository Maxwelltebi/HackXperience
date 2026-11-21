import { setDeleted, tx } from '@hx/db';
import { z } from 'zod';
import { handler } from '@/lib/api/handler';
import { noContent } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** POST /api/v1/events/{id}/teams/{tid}/restore: owner. Audited. */
export const POST = handler(
  { event: { permission: 'records.delete' }, params: z.object({ id: z.uuid(), tid: z.uuid() }) },
  async ({ access, params, userId }) => {
    await tx((sql) => setDeleted(sql, 'team', access.event.id, params.tid, userId, false));
    return noContent();
  },
);
