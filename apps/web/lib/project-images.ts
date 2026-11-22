import { PROJECT_IMAGES } from '@hx/shared';

/** The public address of a project image (R41). The bucket is public: galleries are public. */
export function projectImageUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = path.split('/').map(encodeURIComponent).join('/');
  return `${base}/storage/v1/object/public/${PROJECT_IMAGES.bucket}/${key}`;
}
