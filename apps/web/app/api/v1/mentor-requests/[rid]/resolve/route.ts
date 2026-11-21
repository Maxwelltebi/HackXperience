import { resolveMentorRequest } from '@hx/db';
import { mentorAction } from '@/lib/api/mentor-routes';

export const dynamic = 'force-dynamic';

/** POST /api/v1/mentor-requests/{rid}/resolve: the mentor who claimed it. */
export const POST = mentorAction('mentor.claim', resolveMentorRequest);
