import { describe, expect, it } from 'vitest';
import { dueEventAlerts } from './event-alerts';

const at = (iso: string) => new Date(iso);
const open = at('2027-03-01T09:00:00Z');
const close = at('2027-03-10T09:00:00Z');

describe('dueEventAlerts (R42)', () => {
  it('sends nothing before applications open, or without a window', () => {
    expect(
      dueEventAlerts(
        { applicationsOpenAt: open, applicationsCloseAt: close, sent: {} },
        at('2027-02-28T09:00:00Z'),
      ),
    ).toEqual([]);
    expect(
      dueEventAlerts(
        { applicationsOpenAt: null, applicationsCloseAt: close, sent: {} },
        at('2027-03-02T09:00:00Z'),
      ),
    ).toEqual([]);
  });

  it('sends "applications open" once the window opens, once', () => {
    const now = at('2027-03-01T09:01:00Z');
    expect(
      dueEventAlerts({ applicationsOpenAt: open, applicationsCloseAt: close, sent: {} }, now),
    ).toEqual(['applications_open']);
    expect(
      dueEventAlerts(
        { applicationsOpenAt: open, applicationsCloseAt: close, sent: { applications_open: now } },
        at('2027-03-05T09:00:00Z'),
      ),
    ).toEqual([]);
  });

  it('sends "closing soon" in the last 48 hours, once', () => {
    const sent = { applications_open: at('2027-03-01T09:01:00Z') };
    expect(
      dueEventAlerts(
        { applicationsOpenAt: open, applicationsCloseAt: close, sent },
        at('2027-03-08T08:59:00Z'),
      ),
    ).toEqual([]);
    expect(
      dueEventAlerts(
        { applicationsOpenAt: open, applicationsCloseAt: close, sent },
        at('2027-03-08T09:00:00Z'),
      ),
    ).toEqual(['closing_soon']);
    expect(
      dueEventAlerts(
        {
          applicationsOpenAt: open,
          applicationsCloseAt: close,
          sent: { ...sent, closing_soon: at('2027-03-08T09:00:00Z') },
        },
        at('2027-03-09T09:00:00Z'),
      ),
    ).toEqual([]);
  });

  it('waits 24 hours after another alert before "closing soon"', () => {
    const shortClose = at('2027-03-02T21:00:00Z'); // a 36-hour window
    expect(
      dueEventAlerts(
        { applicationsOpenAt: open, applicationsCloseAt: shortClose, sent: {} },
        at('2027-03-01T09:01:00Z'),
      ),
    ).toEqual(['applications_open']);
    const sent = { applications_open: at('2027-03-01T09:01:00Z') };
    expect(
      dueEventAlerts(
        { applicationsOpenAt: open, applicationsCloseAt: shortClose, sent },
        at('2027-03-02T09:00:00Z'),
      ),
    ).toEqual([]);
    expect(
      dueEventAlerts(
        { applicationsOpenAt: open, applicationsCloseAt: shortClose, sent },
        at('2027-03-02T09:01:00Z'),
      ),
    ).toEqual(['closing_soon']);
  });

  it('sends nothing in the last hour or after applications close', () => {
    expect(
      dueEventAlerts(
        { applicationsOpenAt: open, applicationsCloseAt: close, sent: {} },
        at('2027-03-10T08:30:00Z'),
      ),
    ).toEqual([]);
    expect(
      dueEventAlerts(
        { applicationsOpenAt: open, applicationsCloseAt: close, sent: {} },
        at('2027-03-11T09:00:00Z'),
      ),
    ).toEqual([]);
  });
});
