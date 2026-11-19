import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { uuidSchema } from '@hx/shared';
import { supabaseEnv } from '../supabase/env';

/**
 * The verified user id for an API request, or null.
 * Mobile sends `Authorization: Bearer <access token>`; the web sends its session cookie.
 * Tokens are verified with getClaims() (Supabase signing keys), never just decoded.
 */
export async function authenticate(request: Request): Promise<string | null> {
  const { url, anonKey } = supabaseEnv();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () =>
        parseCookieHeader(request.headers.get('cookie') ?? '').map(({ name, value }) => ({
          name,
          value: value ?? '',
        })),
      // The proxy refreshes cookies; route handlers only read them.
      setAll: () => {},
    },
  });

  const token = bearerToken(request);
  const { data, error } = token
    ? await supabase.auth.getClaims(token)
    : await supabase.auth.getClaims();
  if (error || !data) return null;

  const { sub, role } = data.claims;
  if (role !== 'authenticated') return null;
  const parsed = uuidSchema.safeParse(sub);
  return parsed.success ? parsed.data : null;
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}
