import { getSql, isOrgMember, orgImpact, orgImpactCsv } from '@hx/db';
import { ApiError, orgParamsSchema, orgReportQuerySchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { csvResponse, json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** GET /api/v1/orgs/{orgId}/reports/impact?from=&to=&format=: organization members. */
export const GET = handler(
  { params: orgParamsSchema, query: orgReportQuerySchema },
  async ({ params, query, userId }) => {
    const sql = getSql();
    if (!(await isOrgMember(sql, params.orgId, userId))) {
      throw new ApiError('FORBIDDEN', "You don't have access to this.");
    }
    const report = await orgImpact(sql, params.orgId, query);
    return query.format === 'csv'
      ? csvResponse(orgImpactCsv(report), 'impact-report.csv')
      : json(report);
  },
);
