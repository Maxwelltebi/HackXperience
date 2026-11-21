import 'server-only';
// Fetches the PEM certificate an SNS message was signed with. Its own module so tests can
// replace the network call; the URL is checked to be AWS's before this is ever called.
const cache = new Map<string, string>();

export async function fetchSigningCertificate(url: string): Promise<string> {
  const cached = cache.get(url);
  if (cached) return cached;
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`certificate fetch failed: ${response.status}`);
  const pem = await response.text();
  if (!pem.includes('BEGIN CERTIFICATE')) throw new Error('not a certificate');
  cache.set(url, pem);
  return pem;
}
