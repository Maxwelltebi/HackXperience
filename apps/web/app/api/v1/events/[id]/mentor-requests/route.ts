import { createMentorRequest, getSql, hitRateLimit, listMentorRequests, tx } from '@hx/db';
import {
  createMentorRequestBodySchema,
  mentorRequestsQuerySchema,
  RATE_LIMITS_PER_MINUTE,
} from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** POST /api/v1/events/{id}/mentor-requests {topic, description}: a team member, while live. */
export const POST = handler(
  { event: {}, clientId: true, body: createMentorRequestBodySchema },
  async ({ access, userId, id, body }) => {
    await hitRateLimit(
      getSql(),
      `mentor_request:${userId}`,
      RATE_LIMITS_PER_MINUTE.mentorRequest,
      60,
    );
    return json(
      await tx((sql) => createMentorRequest(sql, access.event.id, userId, id, body)),
      201,
    );
  },
);

/** GET /api/v1/events/{id}/mentor-requests?status=: mentors, admins, owners. */
export const GET = handler(
  { event: { permission: 'mentor.view' }, query: mentorRequestsQuerySchema },
  async ({ access, query }) => {
    return json(await listMentorRequests(getSql(), access.event.id, query.status));
  },
);
