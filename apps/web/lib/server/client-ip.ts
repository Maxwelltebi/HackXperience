import 'server-only';

/**
 * The caller's IP address, for rate limits on endpoints that need no account. Vercel sets
 * x-forwarded-for (first entry is the client) and x-real-ip; elsewhere it may be missing, and
 * every such caller shares one bucket.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown';
}
