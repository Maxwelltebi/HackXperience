import { ApiError, SERVER_TIME_HEADER, type ErrorCode, type ErrorDetails } from '@hx/shared';

/** A JSON response. */
export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
}

/** An empty 204 response. */
export function noContent(): Response {
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}

/** A response in the one error shape. */
export function errorResponse(code: ErrorCode, message: string, details?: ErrorDetails): Response {
  const error = new ApiError(code, message, details);
  return json(error.toBody(), error.status);
}

/** Copy of `response` with the server_time header set (works on immutable responses too). */
export function withServerTime(response: Response, now: Date = new Date()): Response {
  const headers = new Headers(response.headers);
  headers.set(SERVER_TIME_HEADER, now.toISOString());
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * A CSV download. The byte-order mark makes Excel read the file as UTF-8, so names with
 * accents survive.
 */
export function csvResponse(csv: string, filename: string): Response {
  return new Response(`\uFEFF${csv}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"`,
      'cache-control': 'no-store',
    },
  });
}
