/**
 * Team invite codes: 8 characters with no look-alikes (no 0, O, 1, I or L), so a code read
 * aloud or copied from a screen can't be mistyped into another team's code
 * (DESIGN Step 6 part 2). 31 symbols, 8 characters: about 8.5 × 10^11 codes.
 */
export const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 8;

export function generateInviteCode(
  randomBytes: (size: number) => Uint8Array = cryptoRandomBytes,
): string {
  let code = '';
  // Rejection sampling keeps every symbol equally likely (256 isn't a multiple of 31).
  const limit = 256 - (256 % INVITE_ALPHABET.length);
  while (code.length < INVITE_CODE_LENGTH) {
    for (const byte of randomBytes(INVITE_CODE_LENGTH * 2)) {
      if (byte < limit && code.length < INVITE_CODE_LENGTH) {
        code += INVITE_ALPHABET[byte % INVITE_ALPHABET.length];
      }
    }
  }
  return code;
}

/**
 * What someone typed ("k7qm x4pr", "K7QM-X4PR") to the stored form ("K7QMX4PR"), or null
 * if it can't be a valid code. Look-alikes are not guessed back (an "O" is just invalid).
 */
export function normalizeInviteCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== INVITE_CODE_LENGTH) return null;
  for (const char of code) {
    if (!INVITE_ALPHABET.includes(char)) return null;
  }
  return code;
}

/** "K7QMX4PR" → "K7QM X4PR", as the design shows codes. */
export function formatInviteCode(code: string): string {
  return `${code.slice(0, 4)} ${code.slice(4)}`;
}

function cryptoRandomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}
