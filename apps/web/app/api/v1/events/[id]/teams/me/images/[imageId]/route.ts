import { deleteImage, tx } from '@hx/db';
import { imageParamsSchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';
import { removeFile } from '@/lib/server/storage';

export const dynamic = 'force-dynamic';

/** DELETE /api/v1/events/{id}/teams/me/images/{imageId}: any member, before the deadline (R41). */
export const DELETE = handler(
  { event: {}, params: imageParamsSchema },
  async ({ access, userId, params }) => {
    const { list, path } = await tx((sql) =>
      deleteImage(sql, access.event.id, userId, params.imageId),
    );
    await removeFile(path); // after the commit (Agent rule 9)
    return json(list);
  },
);
