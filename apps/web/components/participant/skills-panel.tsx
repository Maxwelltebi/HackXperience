'use client';

import type { MyApplication, SkillRatings } from '@hx/shared';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/client/api';
import { Busy } from '../loading-state';
import { AlertIcon, CheckIcon } from '../icons';
import { ratingsComplete, SkillRatingsInput, type RatingsDraft } from '../skill-ratings-input';

/**
 * For confirmed participants with no team (R36): their skill ratings, which organizers use to
 * place them on a balanced team. People who applied before ratings existed add them here.
 */
export function SkillsPanel({
  eventId,
  initial,
}: {
  eventId: string;
  initial: SkillRatings | null;
}) {
  const [saved, setSaved] = useState(initial);
  const [ratings, setRatings] = useState<RatingsDraft>(initial ?? {});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const changed = JSON.stringify(ratings) !== JSON.stringify(saved ?? {});

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ratingsComplete(ratings)) {
      setNotice({ tone: 'danger', text: 'Rate all four skills.' });
      return;
    }
    setBusy(true);
    const result = await api<MyApplication>(`/events/${eventId}/applications/me/skills`, {
      method: 'PUT',
      body: { skill_ratings: ratings },
    });
    setBusy(false);
    if (!result.ok) {
      setNotice({ tone: 'danger', text: result.message });
      return;
    }
    setSaved(result.data.skill_ratings);
    setNotice({ tone: 'success', text: 'Saved. Organizers see these when they form teams.' });
  }

  return (
    <form className="panel card stack" onSubmit={save} noValidate aria-labelledby="skills-title">
      <div className="stack-sm" style={{ gap: 2 }}>
        <h2 id="skills-title" className="h2">
          {saved ? 'Your skills' : 'Add your skills'}
        </h2>
        <span className="muted small">
          {saved
            ? 'If you stay without a team, the organizers may place you on one using these.'
            : "You applied before we asked. Without ratings, organizers can't place you as well."}
        </span>
      </div>
      <SkillRatingsInput value={ratings} onChange={setRatings} />
      {notice ? (
        <p className={`banner banner-${notice.tone}`} role="status" style={{ margin: 0 }}>
          {notice.tone === 'success' ? <CheckIcon /> : <AlertIcon />} {notice.text}
        </p>
      ) : null}
      <div>
        <button
          type="submit"
          className={saved ? 'btn' : 'btn btn-primary'}
          disabled={busy || !changed}
        >
          {busy ? <Busy>Saving…</Busy> : 'Save ratings'}
        </button>
      </div>
    </form>
  );
}
