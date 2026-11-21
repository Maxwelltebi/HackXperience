import { setMySkills, tx } from '@hx/db';
import { skillsBodySchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/**
 * PUT /api/v1/events/{id}/applications/me/skills {skill_ratings}: the applicant's own skill
 * ratings (R36), for people who applied before ratings existed. Until the submission deadline.
 */
export const PUT = handler(
  { event: {}, body: skillsBodySchema },
  async ({ access, userId, body }) => {
    return json(await tx((sql) => setMySkills(sql, access.event.id, userId, body.skill_ratings)));
  },
);
