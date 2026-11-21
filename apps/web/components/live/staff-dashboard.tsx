'use client';

import { liveStatsSchema, liveTopics, type LiveStats } from '@hx/shared';
import { useCallback, useState } from 'react';
import { api } from '@/lib/client/api';
import { useLiveChannel } from '@/lib/client/use-live-channel';

/** Live counts for owners and admins on event:{id}:staff. The broadcasts carry the numbers. */
export function StaffDashboard({ eventId, initial }: { eventId: string; initial: LiveStats }) {
  const [stats, setStats] = useState(initial);

  const refetch = useCallback(async () => {
    const result = await api<LiveStats>(`/events/${eventId}/live-stats`);
    if (!result.ok) return null;
    setStats(result.data);
    return result.data.version;
  }, [eventId]);
  useLiveChannel(liveTopics.staff(eventId), refetch, (hint) => {
    const parsed = liveStatsSchema.safeParse(hint);
    if (!parsed.success) return false;
    setStats((current) => (parsed.data.version > current.version ? parsed.data : current));
    return true;
  });

  const tiles: { label: string; value: string; note?: string }[] = [
    { label: 'Checked in', value: `${stats.checked_in}`, note: `of ${stats.confirmed} confirmed` },
    { label: 'Teams', value: `${stats.teams}` },
    { label: 'Submitted', value: `${stats.submitted}`, note: `${stats.drafts} still drafts` },
    {
      label: 'Scores in',
      value: `${stats.scores_in}`,
      note: `of ${stats.scores_expected} assigned`,
    },
    {
      label: 'Waiting for a mentor',
      value: `${stats.mentor_open}`,
      note: `${stats.mentor_claimed} being helped`,
    },
  ];

  return (
    <div className="grid-2">
      {tiles.map((t) => (
        <section key={t.label} className="raised card stack-sm" aria-label={t.label}>
          <span className="muted small">{t.label}</span>
          <strong className="mono" style={{ fontSize: 40, lineHeight: 1 }}>
            {t.value}
          </strong>
          {t.note ? <span className="muted small">{t.note}</span> : null}
        </section>
      ))}
    </div>
  );
}
