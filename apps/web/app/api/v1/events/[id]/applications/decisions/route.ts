import { decideApplications, tx } from '@hx/db';
import { decisionsBodySchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/events/{id}/applications/decisions {application_ids, status}: owner, admin.
 * One audit row and one delayed decision email per changed application, at any status (R34,
 * R35): changing a confirmed applicant cancels their ticket.
 */
export const POST = handler(
  { event: { permission: 'applications.decide' }, body: decisionsBodySchema },
  async ({ access, userId, body }) => {
    const result = await tx((sql) =>
      decideApplications(sql, access.event.id, userId, body.application_ids, body.status),
    );
    return json(result);
  },
);
