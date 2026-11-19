/**
 * Where to send someone after sign-in. Only same-site paths are allowed, so a
 * crafted ?next= cannot bounce a user to another site after they sign in.
 */
export function safeNext(value: string | null | undefined, fallback = '/profile'): string {
  if (!value) return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  if (/[\r\n\t]/.test(value)) return fallback;
  return value;
}
