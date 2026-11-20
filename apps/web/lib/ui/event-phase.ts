import type { EventSummary } from '@hx/shared';
import type { Tone } from './status';

/** What a visitor most needs to know about an event right now, as a chip. */
export function eventPhase(
  event: EventSummary,
  now: Date = new Date(),
): { label: string; tone: Tone } {
  const at = (iso: string | null) => (iso ? new Date(iso) : null);
  const open = at(event.applications_open_at);
  const close = at(event.applications_close_at);

  if (event.status === 'completed') return { label: 'Results out', tone: 'muted' };
  if (event.status === 'judging') return { label: 'Judging', tone: 'warning' };
  if (event.status === 'live') return { label: 'Live now', tone: 'success' };
  if (event.status === 'draft') return { label: 'Draft', tone: 'muted' };
  if (open && now < open) return { label: 'Applications open soon', tone: 'info' };
  if (open && close && now >= open && now < close)
    return { label: 'Applications open', tone: 'success' };
  if (new Date(event.ends_at) < now) return { label: 'Finished', tone: 'muted' };
  return { label: 'Applications closed', tone: 'muted' };
}
