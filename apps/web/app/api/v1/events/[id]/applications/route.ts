import { applyToEvent, getSql, hitRateLimit, listApplications, tx } from '@hx/db';
import { applicationListQuerySchema, applyBodySchema, RATE_LIMITS_PER_MINUTE } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/events/{id}/applications: any signed-in person, only while applications
 * are open. Applying again returns the first application (200) instead of a duplicate.
 */
export const POST = handler(
  { event: {}, body: applyBodySchema },
  async ({ access, userId, body }) => {
    await hitRateLimit(getSql(), `apply:${userId}`, RATE_LIMITS_PER_MINUTE.apply, 60);
    const { application, created } = await tx((sql) =>
      applyToEvent(sql, access.event.id, userId, body.answers),
    );
    return json(application, created ? 201 : 200);
  },
);

/** GET /api/v1/events/{id}/applications?status=&q=&cursor=&limit=: owner, admin. */
export const GET = handler(
  { event: { permission: 'applications.decide' }, query: applicationListQuerySchema },
  async ({ access, query }) => {
    return json(await listApplications(getSql(), access.event.id, query));
  },
);
