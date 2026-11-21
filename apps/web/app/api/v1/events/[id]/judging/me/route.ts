import { getJudgeQueue, getSql } from '@hx/db';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** GET /api/v1/events/{id}/judging/me: a judge's assigned submissions and progress. */
export const GET = handler(
  { event: { permission: 'scores.write' } },
  async ({ access, userId }) => {
    return json(await getJudgeQueue(getSql(), access.event.id, userId));
  },
);
