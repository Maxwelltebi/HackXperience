import { rsvp, tx } from '@hx/db';
import { rsvpBodySchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** POST /api/v1/events/{id}/applications/me/rsvp {response}: accepted applicants. Audited. */
export const POST = handler(
  { event: {}, body: rsvpBodySchema },
  async ({ access, userId, body }) => {
    return json(await tx((sql) => rsvp(sql, access.event.id, userId, body.response)));
  },
);
