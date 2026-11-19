import { getPublicProfile, getSql } from '@hx/db';
import { ApiError, idParamsSchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** GET /api/v1/users/{id}/profile: public profile. No email or private fields. Badges arrive in Phase 5. */
export const GET = handler({ auth: 'none', params: idParamsSchema }, async ({ params }) => {
  const profile = await getPublicProfile(getSql(), params.id);
  if (!profile) throw new ApiError('NOT_FOUND', 'No such user.');
  return json(profile);
});
