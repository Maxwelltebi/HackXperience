import { reopenSubmissions, tx } from '@hx/db';
import { reopenSubmissionsBodySchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/events/{id}/submissions/reopen {submission_deadline}: owner only, after an
 * outage (DESIGN Step 7). Sets a new deadline later than now and clears the lock. Audited.
 */
export const POST = handler(
  { event: { permission: 'submissions.reopen' }, body: reopenSubmissionsBodySchema },
  async ({ access, userId, body }) => {
    const deadline = new Date(body.submission_deadline);
    return json(await tx((sql) => reopenSubmissions(sql, access.event.id, userId, deadline)));
  },
);
