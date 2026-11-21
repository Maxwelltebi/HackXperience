import { claimMentorRequest } from '@hx/db';
import { mentorAction } from '@/lib/api/mentor-routes';

export const dynamic = 'force-dynamic';

/** POST /api/v1/mentor-requests/{rid}/claim: a mentor. Exactly one of two simultaneous claims wins. */
export const POST = mentorAction('mentor.claim', claimMentorRequest);
