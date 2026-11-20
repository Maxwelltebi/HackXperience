/**
 * A random, URL-safe ticket code: 16 random bytes as base64url, 22 characters
 * (build plan Phase 2: unique, URL-safe, at least 16 characters). Uniqueness is
 * enforced by the database; 128 random bits make a clash practically impossible.
 */
export function generateTicketCode(
  randomBytes: (size: number) => Uint8Array = cryptoRandomBytes,
): string {
  const bytes = randomBytes(16);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function cryptoRandomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}
