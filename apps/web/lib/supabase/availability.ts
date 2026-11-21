/** The placeholder key in a fresh apps/web/.env.local: sign-in isn't set up on this computer. */
export const LOCAL_PLACEHOLDER_KEY = 'local-placeholder';

export type AuthAvailability = 'ok' | 'not_configured' | 'unreachable';

/**
 * Whether Supabase Auth can be reached before we send someone's browser there. Any HTTP
 * answer counts as reachable; only a network failure or timeout doesn't. Without this check,
 * an unreachable service leaves the person on a dead browser error page.
 */
export async function checkAuthAvailability(
  url: string,
  anonKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AuthAvailability> {
  if (anonKey === LOCAL_PLACEHOLDER_KEY) return 'not_configured';
  try {
    await fetchImpl(`${url.replace(/\/+$/, '')}/auth/v1/health`, {
      headers: { apikey: anonKey },
      signal: AbortSignal.timeout(3_000),
      cache: 'no-store',
    });
    return 'ok';
  } catch {
    return 'unreachable';
  }
}
