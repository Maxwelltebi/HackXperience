import { assertPlatformAdmin, listPlatformPeople, removeOrganizer, tx } from '@hx/db';
import { adminUserParamsSchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/v1/admin/organizers/{userId}: they can no longer create CIReN events (R43). Their
 * events and event roles stay. Platform admins only; everyone else gets 404 (R44).
 */
export const DELETE = handler(
  { auth: 'optional', params: adminUserParamsSchema },
  async ({ userId, params }) => {
    const people = await tx(async (sql) => {
      const adminId = await assertPlatformAdmin(sql, userId);
      await removeOrganizer(sql, adminId, params.userId);
      return listPlatformPeople(sql);
    });
    return json(people);
  },
);
