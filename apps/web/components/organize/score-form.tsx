'use client';

import type { JudgingSubmission, MyScore, RubricCriterion } from '@hx/shared';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/client/api';
import { AlertIcon, CheckIcon } from '../icons';
import { Busy } from '@/components/loading-state';
import { useRouterTransition } from '@/lib/client/use-router-transition';

interface Props {
  eventId: string;
  submissionId: string;
  criteria: RubricCriterion[];
  initial: MyScore[];
  /** Scoring is open (the event is judging). */
  open: boolean;
  nextHref: string;
  nextLabel: string;
}

interface Entry {
  score: string;
  comment: string;
}

/** The rubric form: every criterion scored at once, each with an optional comment for the team. */
export function ScoreForm({
  eventId,
  submissionId,
  criteria,
  initial,
  open,
  nextHref,
  nextLabel,
}: Props) {
  const navigate = useRouterTransition();
  const [entries, setEntries] = useState<Record<string, Entry>>(() =>
    Object.fromEntries(
      criteria.map((c) => {
        const mine = initial.find((s) => s.criterion_id === c.id);
        return [c.id, { score: mine ? String(mine.score) : '', comment: mine?.comment ?? '' }];
      }),
    ),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const saved = initial.length === criteria.length && criteria.length > 0;

  const set = (id: string, patch: Partial<Entry>) =>
    setEntries((e) => ({ ...e, [id]: { ...(e[id] ?? { score: '', comment: '' }), ...patch } }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    for (const c of criteria) {
      const raw = entries[c.id]?.score.trim() ?? '';
      const value = Number(raw);
      if (raw === '' || !Number.isFinite(value)) local[c.id] = 'Enter a score.';
      else if (value < 0 || value > c.max_score) local[c.id] = `From 0 to ${c.max_score}.`;
    }
    setErrors(local);
    if (Object.keys(local).length > 0) return;

    setBusy(true);
    const result = await api<JudgingSubmission>(
      `/events/${eventId}/submissions/${submissionId}/scores/me`,
      {
        method: 'PUT',
        body: {
          scores: criteria.map((c) => ({
            criterion_id: c.id,
            score: Number(entries[c.id]?.score),
            comment: entries[c.id]?.comment.trim() || null,
          })),
        },
      },
    );
    if (!result.ok) {
      setBusy(false);
      setNotice({ tone: 'danger', text: result.message });
      return;
    }
    setNotice({
      tone: 'success',
      text: 'Scores saved. You can change them until results are published.',
    });
    navigate.refresh(() => setBusy(false));
  }

  if (criteria.length === 0) {
    return (
      <section className="panel card">
        <p className="muted" style={{ margin: 0 }}>
          The organizers haven&apos;t added a rubric yet.
        </p>
      </section>
    );
  }

  return (
    <form className="panel card stack" onSubmit={submit} aria-label="Your scores">
      <div className="row-between">
        <h2 className="h2">Your scores</h2>
        {saved ? (
          <span className="chip chip-success">Scored</span>
        ) : (
          <span className="chip chip-warning">To score</span>
        )}
      </div>
      {notice ? (
        <p className={`banner banner-${notice.tone}`} role="status" style={{ margin: 0 }}>
          {notice.tone === 'success' ? <CheckIcon /> : <AlertIcon />} {notice.text}
        </p>
      ) : null}
      {criteria.map((c) => (
        <fieldset key={c.id} className="stack-sm" style={{ border: 0, margin: 0, padding: 0 }}>
          <legend className="label" style={{ marginBottom: 6 }}>
            {c.name}{' '}
            <span className="muted small">
              out of <span className="mono">{c.max_score}</span>
              {c.weight !== 1 ? ` · weight ${c.weight}` : ''}
              {c.is_tiebreaker ? ' · tiebreaker' : ''}
            </span>
          </legend>
          {c.description ? (
            <p className="muted small" style={{ margin: 0 }}>
              {c.description}
            </p>
          ) : null}
          <input
            className="input mono"
            type="number"
            inputMode="decimal"
            min={0}
            max={c.max_score}
            step="any"
            aria-label={`${c.name} score`}
            aria-invalid={Boolean(errors[c.id])}
            disabled={!open}
            value={entries[c.id]?.score ?? ''}
            onChange={(e) => set(c.id, { score: e.target.value })}
            style={{ maxWidth: 140 }}
          />
          {errors[c.id] ? <span className="field-error">{errors[c.id]}</span> : null}
          <textarea
            className="textarea"
            rows={2}
            maxLength={2000}
            aria-label={`${c.name} comment`}
            placeholder="Comment for the team (optional; shown without your name after results)"
            disabled={!open}
            value={entries[c.id]?.comment ?? ''}
            onChange={(e) => set(c.id, { comment: e.target.value })}
          />
        </fieldset>
      ))}
      {open ? (
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? <Busy>Saving…</Busy> : saved ? 'Update scores' : 'Save scores'}
        </button>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>
          Scoring is closed.
        </p>
      )}
      <Link className="btn btn-block" href={nextHref}>
        {nextLabel}
      </Link>
    </form>
  );
}
