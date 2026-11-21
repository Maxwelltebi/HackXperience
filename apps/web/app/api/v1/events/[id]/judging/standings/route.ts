import { getPublishedStandings, getSql, getStandings } from '@hx/db';
import { z } from 'zod';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/events/{id}/judging/standings: owner, admin. Raw and normalized scores side by
 * side, with judging progress. `?published=true` returns the standings frozen at publication.
 */
export const GET = handler(
  {
    event: { permission: 'judging.manage' },
    query: z.object({ published: z.enum(['true']).optional() }),
  },
  async ({ access, query }) => {
    const sql = getSql();
    return json(
      query.published
        ? await getPublishedStandings(sql, access.event.id)
        : await getStandings(sql, access.event.id),
    );
  },
);
