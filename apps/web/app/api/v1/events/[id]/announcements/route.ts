import { createAnnouncement, getSql, listAnnouncements, requireConfirmed, tx } from '@hx/db';
import { announcementsQuerySchema, createAnnouncementBodySchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/events/{id}/announcements {title, body}: owner, admin. Saves it and queues a
 * push to every confirmed participant and staff member with the app. Retry-safe with an id.
 */
export const POST = handler(
  {
    event: { permission: 'announcements.write' },
    clientId: true,
    body: createAnnouncementBodySchema,
  },
  async ({ access, userId, id, body }) => {
    return json(await tx((sql) => createAnnouncement(sql, access.event.id, userId, id, body)), 201);
  },
);

/** GET /api/v1/events/{id}/announcements?since=: staff and confirmed participants. */
export const GET = handler(
  { event: {}, query: announcementsQuerySchema },
  async ({ access, userId, query }) => {
    const sql = getSql();
    if (access.roles.length === 0) await requireConfirmed(sql, access.event.id, userId);
    return json(await listAnnouncements(sql, access.event.id, query.since));
  },
);
