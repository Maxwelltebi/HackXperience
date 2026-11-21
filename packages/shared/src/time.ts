// Times are stored and sent in UTC; the UI shows them in the user's chosen zone (Agent rule 23).
// No date library: Intl does the zone math.

const WALL_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** Minutes `timeZone` is ahead of UTC at `instant` (Accra 0, Lagos 60, New York -300 or -240). */
export function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wallAsUtc = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
  const instantSeconds = Math.floor(instant.getTime() / 1000) * 1000;
  return Math.round((wallAsUtc - instantSeconds) / 60_000);
}

/**
 * A wall-clock time in `timeZone` ("2026-12-06T12:00", as a datetime-local input gives it)
 * to a UTC ISO string. Times skipped by a daylight-saving jump move forward by the gap.
 */
export function zonedToUtc(wallTime: string, timeZone: string): string {
  const match = WALL_TIME.exec(wallTime);
  if (!match) throw new Error(`Expected YYYY-MM-DDTHH:mm, got "${wallTime}"`);
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi);
  const firstOffset = zoneOffsetMinutes(new Date(wallAsUtc), timeZone);
  let utc = wallAsUtc - firstOffset * 60_000;
  const secondOffset = zoneOffsetMinutes(new Date(utc), timeZone);
  if (secondOffset !== firstOffset) utc = wallAsUtc - secondOffset * 60_000;
  return new Date(utc).toISOString();
}

/** A UTC ISO string to "YYYY-MM-DDTHH:mm" in `timeZone`, for datetime-local inputs. */
export function utcToZoned(iso: string, timeZone: string): string {
  const instant = new Date(iso);
  const shifted = new Date(instant.getTime() + zoneOffsetMinutes(instant, timeZone) * 60_000);
  return shifted.toISOString().slice(0, 16);
}

/** "Sat 6 Dec 2026, 12:00 GMT" in `timeZone`. */
export function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  })
    .format(new Date(iso))
    .replace(' at ', ', ');
}

/** "6 Dec 2026" in `timeZone`. */
export function formatDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

/** "08:42 GMT" in `timeZone`. */
export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).format(new Date(iso));
}
