import { eventImpact, eventImpactCsv, getSql } from '@hx/db';
import { reportFormatQuerySchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { csvResponse, json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** GET /api/v1/events/{id}/reports/impact?format=json|csv: owner, admin. */
export const GET = handler(
  { event: { permission: 'reports.read' }, query: reportFormatQuerySchema },
  async ({ access, query }) => {
    const report = await eventImpact(getSql(), access.event.id);
    return query.format === 'csv'
      ? csvResponse(eventImpactCsv(report), `impact-${access.event.slug}.csv`)
      : json(report);
  },
);
