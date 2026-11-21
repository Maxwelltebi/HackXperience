import { getSql, getTicket } from '@hx/db';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** GET /api/v1/events/{id}/me/ticket: confirmed participants. The QR code encodes ticket_code. */
export const GET = handler({ event: {} }, async ({ access, userId }) => {
  return json(await getTicket(getSql(), access.event.id, userId));
});
