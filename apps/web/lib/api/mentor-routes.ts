import { getSql, loadEventRoles, mentorRequestEvent, tx, type ISql } from '@hx/db';
import {
  ApiError,
  can,
  mentorRequestParamsSchema,
  type MentorRequest,
  type Permission,
} from '@hx/shared';
import { handler } from './handler';
import { json } from './respond';

/**
 * POST /mentor-requests/{rid}/{action}. These paths carry no event id, so the request's event
 * is looked up first and the caller's roles there are checked like handler()'s event option.
 */
export function mentorAction(
  permission: Permission | null,
  act: (sql: ISql, id: string, userId: string) => Promise<MentorRequest>,
) {
  return handler({ params: mentorRequestParamsSchema }, async ({ params, userId }) => {
    const eventId = await mentorRequestEvent(getSql(), params.rid);
    if (permission) {
      const access = await loadEventRoles(getSql(), eventId, userId);
      if (!access || !can(access.roles, permission)) {
        throw new ApiError('FORBIDDEN', "You don't have access to this.");
      }
    }
    return json(await tx((sql) => act(sql, params.rid, userId)));
  });
}
