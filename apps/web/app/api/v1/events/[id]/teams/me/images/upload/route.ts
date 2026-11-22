import { planImageUpload, tx } from '@hx/db';
import { imageUploadBodySchema, type ImageUpload } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';
import { createUploadLink } from '@/lib/server/storage';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/events/{id}/teams/me/images/upload {content_type, size}: any member, before the
 * deadline and while the project has room (R41). Returns a one-time upload link for the browser.
 */
export const POST = handler(
  { event: {}, body: imageUploadBodySchema },
  async ({ access, userId, body }) => {
    const { path } = await tx((sql) =>
      planImageUpload(sql, access.event.id, userId, body.content_type),
    );
    const upload: ImageUpload = await createUploadLink(path);
    return json(upload);
  },
);
