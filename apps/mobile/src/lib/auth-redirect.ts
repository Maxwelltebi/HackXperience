/** What came back on the OAuth redirect URL. */
export type AuthRedirect =
  { kind: 'code'; code: string } | { kind: 'error'; message: string } | { kind: 'none' };

/**
 * Reads the PKCE `code` (or an OAuth error) from the deep link Supabase redirects to,
 * e.g. hackxperience://auth/callback?code=abc. Errors can arrive in the query or the fragment.
 */
export function parseAuthRedirect(url: string): AuthRedirect {
  const queryStart = url.indexOf('?');
  const hashStart = url.indexOf('#');
  const query =
    queryStart === -1
      ? ''
      : url.slice(queryStart + 1, hashStart > queryStart ? hashStart : undefined);
  const fragment = hashStart === -1 ? '' : url.slice(hashStart + 1);
  const params = new URLSearchParams(query);
  const fragmentParams = new URLSearchParams(fragment);

  const error =
    params.get('error_description') ??
    fragmentParams.get('error_description') ??
    params.get('error') ??
    fragmentParams.get('error');
  if (error) return { kind: 'error', message: error };

  const code = params.get('code');
  if (code) return { kind: 'code', code };
  return { kind: 'none' };
}
