import { putMyScores, tx } from '@hx/db';
import { putScoresBodySchema, submissionParamsSchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/**
 * PUT /api/v1/events/{id}/submissions/{sid}/scores/me {scores: [{criterion_id, score, comment}]}:
 * an assigned judge, every criterion at once, each within max_score, only while judging.
 */
export const PUT = handler(
  {
    event: { permission: 'scores.write' },
    params: submissionParamsSchema,
    body: putScoresBodySchema,
  },
  async ({ access, params, userId, body }) => {
    return json(await tx((sql) => putMyScores(sql, access.event.id, params.sid, userId, body)));
  },
);
