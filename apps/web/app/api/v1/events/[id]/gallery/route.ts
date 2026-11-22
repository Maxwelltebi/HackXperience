import { setGalleryPublished, tx } from '@hx/db';
import { galleryPublishBodySchema } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/events/{id}/gallery {published}: owner. Opens the project gallery to everyone, or
 * hides it again, before results are published (R40). Audited.
 */
export const POST = handler(
  { event: { permission: 'gallery.publish' }, body: galleryPublishBodySchema },
  async ({ access, userId, body }) => {
    return json(
      await tx((sql) => setGalleryPublished(sql, access.event.id, userId, body.published)),
    );
  },
);
