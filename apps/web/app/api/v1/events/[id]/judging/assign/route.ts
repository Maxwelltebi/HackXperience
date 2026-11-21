import { assignJudgesForEvent, tx } from '@hx/db';
import { assignJudgesBodySchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/events/{id}/judging/assign {judges_per_submission, seed?}: owner, admin, while
 * judging. Balanced, conflict-free; scored assignments are kept and the rest topped up.
 */
export const POST = handler(
  { event: { permission: 'judging.manage' }, body: assignJudgesBodySchema },
  async ({ access, userId, body }) => {
    const result = await tx((sql) =>
      assignJudgesForEvent(sql, access.event.id, userId, body.judges_per_submission, body.seed),
    );
    return json(result);
  },
);
