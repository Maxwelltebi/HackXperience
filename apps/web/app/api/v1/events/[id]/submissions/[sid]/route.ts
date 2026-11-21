import { getSql, getSubmissionForJudging, setDeleted, tx } from '@hx/db';
import { ApiError, can, submissionParamsSchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json, noContent } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/events/{id}/submissions/{sid}: an assigned judge, or an owner or admin. A judge
 * asking for a submission outside their queue gets 404 (DESIGN Step 4 rule 3).
 */
export const GET = handler(
  { event: {}, params: submissionParamsSchema },
  async ({ access, params, userId }) => {
    const readAll = can(access.roles, 'submissions.read_all');
    if (!readAll && !can(access.roles, 'scores.write')) {
      throw new ApiError('FORBIDDEN', "You don't have access to this.");
    }
    return json(
      await getSubmissionForJudging(getSql(), access.event.id, params.sid, { userId, readAll }),
    );
  },
);

/** DELETE /api/v1/events/{id}/submissions/{sid}: owner. Soft delete, audited. */
export const DELETE = handler(
  { event: { permission: 'records.delete' }, params: submissionParamsSchema },
  async ({ access, params, userId }) => {
    await tx((sql) => setDeleted(sql, 'submission', access.event.id, params.sid, userId, true));
    return noContent();
  },
);
