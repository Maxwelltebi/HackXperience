/** IANA zone names look like "UTC", "Africa/Accra" or "America/Argentina/Buenos_Aires". */
const ZONE_NAME = /^[A-Z][A-Za-z_+-]*(?:\/[A-Za-z0-9_+-]+){1,2}$/;

/**
 * True when `name` is an IANA time zone this runtime knows, spelled exactly.
 * Case matters ("utc" is rejected) so the stored value is always the canonical spelling.
 */
export function isValidTimezone(name: string): boolean {
  if (name !== 'UTC' && !ZONE_NAME.test(name)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

/** Every zone the runtime lists, plus UTC, sorted. Used to build pickers. */
export function listTimezones(): string[] {
  const listed =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return Array.from(new Set(['UTC', ...listed])).sort((a, b) => a.localeCompare(b));
}
