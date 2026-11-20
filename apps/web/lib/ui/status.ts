import type { ApplicationStatus, EventMode, EventStatus } from '@hx/shared';

/** Chip tone classes from globals.css. Status is always a dot plus a word, never color alone. */
export type Tone = 'muted' | 'info' | 'success' | 'warning' | 'danger';

export const EVENT_STATUS: Record<EventStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'muted' },
  published: { label: 'Published', tone: 'info' },
  live: { label: 'Live', tone: 'success' },
  judging: { label: 'Judging', tone: 'warning' },
  completed: { label: 'Completed', tone: 'muted' },
};

export const APPLICATION_STATUS: Record<ApplicationStatus, { label: string; tone: Tone }> = {
  submitted: { label: 'Submitted', tone: 'info' },
  accepted: { label: 'Accepted', tone: 'success' },
  waitlisted: { label: 'Waitlisted', tone: 'warning' },
  rejected: { label: 'Rejected', tone: 'danger' },
  confirmed: { label: 'Confirmed', tone: 'success' },
  declined: { label: 'Declined', tone: 'muted' },
};

export const EVENT_MODE: Record<EventMode, string> = {
  in_person: 'In person',
  virtual: 'Online',
  hybrid: 'In person and online',
};

export function chipClass(tone: Tone): string {
  return `chip chip-${tone}`;
}
