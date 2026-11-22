import { addImage, arrangeImages, getMyImages, getSql, tx } from '@hx/db';
import { addImageBodySchema, ApiError, arrangeImagesBodySchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';
import { fileExists } from '@/lib/server/storage';

export const dynamic = 'force-dynamic';

/** GET /api/v1/events/{id}/teams/me/images: the team's project images, cover first (R41). */
export const GET = handler({ event: {} }, async ({ access, userId }) => {
  return json(await getMyImages(getSql(), access.event.id, userId));
});

/**
 * POST /api/v1/events/{id}/teams/me/images {path, caption, width, height}: any member, after
 * uploading with a link from /images/upload. Checks the file arrived (outside the transaction),
 * then adds it as the last image. Refused after the deadline.
 */
export const POST = handler(
  { event: {}, body: addImageBodySchema },
  async ({ access, userId, body }) => {
    if (!(await fileExists(body.path))) {
      throw new ApiError('NOT_FOUND', "The image didn't finish uploading. Try again.");
    }
    return json(await tx((sql) => addImage(sql, access.event.id, userId, body)), 201);
  },
);

/** PUT /api/v1/events/{id}/teams/me/images {images}: order (first is the cover) and captions. */
export const PUT = handler(
  { event: {}, body: arrangeImagesBodySchema },
  async ({ access, userId, body }) => {
    return json(await tx((sql) => arrangeImages(sql, access.event.id, userId, body.images)));
  },
);
