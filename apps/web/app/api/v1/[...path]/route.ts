import { ApiError } from '@hx/shared';
import { handler } from '@/lib/api/handler';

export const dynamic = 'force-dynamic';

/** Unknown /api/v1 paths get a 404 in the standard error shape, with server_time. */
const notFound = handler({ auth: 'none' }, async () => {
  throw new ApiError('NOT_FOUND', 'No such endpoint.');
});

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
