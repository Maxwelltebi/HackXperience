import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';

/** Header pg_cron sends with the tick secret (see migration 0004_cron). */
export const TICK_SECRET_HEADER = 'x-tick-secret';

/**
 * Constant-time comparison of a presented secret with the expected one. Both are hashed
 * first so their lengths can't leak. An unset expected secret never matches.
 */
export function secretMatches(presented: string | null, expected: string | undefined): boolean {
  if (!presented || !expected) return false;
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
