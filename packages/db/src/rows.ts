/** Date (or null) from postgres.js → UTC ISO string (or null) for the API (Agent rule 23). */
export function iso(value: Date): string;
export function iso(value: Date | null): string | null;
export function iso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

/** A LIKE pattern matching `text` anywhere, with %, _ and \ escaped. */
export function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
