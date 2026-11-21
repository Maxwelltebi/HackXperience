import type { EventSummary } from '@hx/shared';
import type { Tone } from './status';

type PhaseFields = Pick<
  EventSummary,
  'status' | 'applications_open_at' | 'applications_close_at' | 'ends_at'
>;

/**
 * What a visitor most needs to know about an event right now, as a status badge (screens PDF,
 * 06): Upcoming, Applications open, Live now, Judging, Ended.
 */
export function eventPhase(
  event: PhaseFields,
  now: Date = new Date(),
): { label: string; tone: Tone } {
  const at = (iso: string | null) => (iso ? new Date(iso) : null);
  const open = at(event.applications_open_at);
  const close = at(event.applications_close_at);

  if (event.status === 'completed') return { label: 'Ended', tone: 'muted' };
  if (event.status === 'judging') return { label: 'Judging', tone: 'warning' };
  if (event.status === 'live') return { label: 'Live now', tone: 'live' };
  if (event.status === 'draft') return { label: 'Draft', tone: 'muted' };
  if (open && now < open) return { label: 'Upcoming', tone: 'info' };
  if (open && close && now >= open && now < close)
    return { label: 'Applications open', tone: 'success' };
  if (new Date(event.ends_at) < now) return { label: 'Ended', tone: 'muted' };
  return { label: 'Applications closed', tone: 'muted' };
}
