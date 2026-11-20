import { createEvent, getSql, isOrgMember, tx } from '@hx/db';
import { ApiError, createEventBodySchema, orgParamsSchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** POST /api/v1/orgs/{orgId}/events: org members create a draft event and become its owner. */
export const POST = handler(
  { params: orgParamsSchema, body: createEventBodySchema },
  async ({ userId, params, body }) => {
    if (!(await isOrgMember(getSql(), params.orgId, userId))) {
      throw new ApiError('FORBIDDEN', 'Only members of this organization can create events.');
    }
    const event = await tx((sql) => createEvent(sql, params.orgId, userId, body));
    return json(event, 201);
  },
);
