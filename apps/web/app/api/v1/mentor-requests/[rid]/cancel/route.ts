import { cancelMentorRequest } from '@hx/db';
import { mentorAction } from '@/lib/api/mentor-routes';

export const dynamic = 'force-dynamic';

/** POST /api/v1/mentor-requests/{rid}/cancel: anyone on the team that asked. */
export const POST = mentorAction(null, cancelMentorRequest);
