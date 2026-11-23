import { addOrganizer, assertPlatformAdmin, getSql, listPlatformPeople, tx } from '@hx/db';
import { adminEmailBodySchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

// Platform admins only (R43). Everyone else, signed in or not, gets 404 (R44).

/** GET /api/v1/admin/organizers: organizers and the fixed platform admin list. */
export const GET = handler({ auth: 'optional' }, async ({ userId }) => {
  const sql = getSql();
  await assertPlatformAdmin(sql, userId);
  return json(await listPlatformPeople(sql));
});

/** POST /api/v1/admin/organizers: lets an existing account create CIReN events. */
export const POST = handler(
  { auth: 'optional', body: adminEmailBodySchema },
  async ({ userId, body }) => {
    const people = await tx(async (sql) => {
      const adminId = await assertPlatformAdmin(sql, userId);
      await addOrganizer(sql, adminId, body.email);
      return listPlatformPeople(sql);
    });
    return json(people);
  },
);
