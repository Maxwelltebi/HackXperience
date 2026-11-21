'use client';

import { formatDateTime, liveTopics, type Announcement, type AnnouncementList } from '@hx/shared';
import { useCallback, useState, type FormEvent } from 'react';
import { api } from '@/lib/client/api';
import { useLiveChannel } from '@/lib/client/use-live-channel';
import { AlertIcon, CheckIcon } from '../icons';

interface FeedProps {
  eventId: string;
  initial: AnnouncementList;
  timezone: string;
  /** Organizers get the composer above the feed. */
  canPost?: boolean;
}

/** Announcements, newest first, updating live on event:{id}:announcements. */
export function AnnouncementFeed({ eventId, initial, timezone, canPost = false }: FeedProps) {
  const [items, setItems] = useState<Announcement[]>(initial.items);

  const refetch = useCallback(async () => {
    const result = await api<AnnouncementList>(`/events/${eventId}/announcements`);
    if (!result.ok) return null;
    setItems(result.data.items);
    return result.data.version;
  }, [eventId]);
  useLiveChannel(liveTopics.announcements(eventId), refetch);

  return (
    <div className="stack">
      {canPost ? <Composer eventId={eventId} onPosted={() => void refetch()} /> : null}
      <section className="raised card stack" aria-labelledby="announcements-title">
        <h2 id="announcements-title" className="h2">
          Announcements
        </h2>
        {items.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nothing yet. Updates from the organizers appear here as they’re posted.
          </p>
        ) : (
          items.map((a) => (
            <article key={a.id} className="inset card-tight stack-sm" style={{ borderRadius: 20 }}>
              <div className="row-between" style={{ gap: 12 }}>
                <strong>{a.title}</strong>
                <time className="mono small muted" dateTime={a.created_at}>
                  {formatDateTime(a.created_at, timezone)}
                </time>
              </div>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{a.body}</p>
              <span className="muted small">{a.author_name}</span>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

function Composer({ eventId, onPosted }: { eventId: string; onPosted: () => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  async function post(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = await api<Announcement>(`/events/${eventId}/announcements`, {
      method: 'POST',
      body: { id: crypto.randomUUID(), title, body },
    });
    setBusy(false);
    if (!result.ok) {
      setNotice({ tone: 'danger', text: result.message });
      return;
    }
    setTitle('');
    setBody('');
    setNotice({ tone: 'success', text: 'Posted. People with the app get a push notification.' });
    onPosted();
  }

  return (
    <form className="raised card stack" onSubmit={post} aria-label="New announcement">
      <h2 className="h2">New announcement</h2>
      {notice ? (
        <p className={`banner banner-${notice.tone}`} role="status" style={{ margin: 0 }}>
          {notice.tone === 'success' ? <CheckIcon /> : <AlertIcon />} {notice.text}
        </p>
      ) : null}
      <label className="field">
        <span className="label">Title</span>
        <input
          className="input"
          maxLength={120}
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="field">
        <span className="label">Message</span>
        <textarea
          className="textarea"
          rows={4}
          maxLength={2000}
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? 'Posting…' : 'Post announcement'}
      </button>
    </form>
  );
}
