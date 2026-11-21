'use client';

import {
  applicationQuestionsSchema,
  QUESTION_TYPES,
  type ApplicationQuestion,
  type Event,
  type QuestionType,
} from '@hx/shared';
import { useState } from 'react';
import { api } from '@/lib/client/api';
import { AlertIcon, CheckIcon } from '../icons';
import { Field } from './event-form';

const TYPE_LABEL: Record<QuestionType, string> = {
  short_text: 'Short answer',
  long_text: 'Paragraph',
  single_choice: 'One choice',
  multi_choice: 'Several choices',
  url: 'Link',
};

/** A draft question: options are edited as one per line. */
interface Draft {
  key: string;
  id: string;
  type: QuestionType;
  label: string;
  required: boolean;
  options: string;
}

function toDraft(q: ApplicationQuestion): Draft {
  return {
    key: q.id,
    id: q.id,
    type: q.type,
    label: q.label,
    required: q.required,
    options: (q.options ?? []).join('\n'),
  };
}

function toQuestion(d: Draft): ApplicationQuestion {
  const isChoice = d.type === 'single_choice' || d.type === 'multi_choice';
  const options = d.options
    .split('\n')
    .map((o) => o.trim())
    .filter(Boolean);
  return {
    id: d.id,
    type: d.type,
    label: d.label,
    required: d.required,
    ...(isChoice ? { options } : {}),
  };
}

/** Question ids from labels: "Why do you want to attend?" → "why_do_you_want_to_attend". */
function idFromLabel(label: string, taken: Set<string>): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32) || 'question';
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}_${n}`;
  return id;
}

export function QuestionsEditor({
  eventId,
  initial,
}: {
  eventId: string;
  initial: ApplicationQuestion[];
}) {
  const [drafts, setDrafts] = useState<Draft[]>(() => initial.map(toDraft));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const update = (index: number, patch: Partial<Draft>) =>
    setDrafts((current) => current.map((d, i) => (i === index ? { ...d, ...patch } : d)));

  function add() {
    const key = crypto.randomUUID();
    setDrafts((current) => [
      ...current,
      { key, id: '', type: 'short_text', label: '', required: false, options: '' },
    ]);
  }

  function move(index: number, by: -1 | 1) {
    setDrafts((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      if (item) next.splice(index + by, 0, item);
      return next;
    });
  }

  async function save() {
    setMessage(null);
    // New questions get an id from their label; saved ids never change, so answers stay matched.
    const taken = new Set(drafts.map((d) => d.id).filter(Boolean));
    const named = drafts.map((d) => {
      if (d.id) return d;
      const id = idFromLabel(d.label, taken);
      taken.add(id);
      return { ...d, id };
    });
    const questions = named.map(toQuestion);
    const local = applicationQuestionsSchema.safeParse(questions);
    if (!local.success) {
      setErrors(Object.fromEntries(local.error.issues.map((i) => [i.path.join('.'), i.message])));
      setMessage({ tone: 'danger', text: 'Some questions need fixing.' });
      return;
    }
    setErrors({});
    setBusy(true);
    const result = await api<Event>(`/events/${eventId}`, {
      method: 'PATCH',
      body: { application_questions: questions },
    });
    setBusy(false);
    if (!result.ok) {
      setErrors(
        Object.fromEntries(
          Object.entries(result.fields).map(([k, v]) => [
            k.replace(/^application_questions\./, ''),
            v,
          ]),
        ),
      );
      setMessage({ tone: 'danger', text: result.message });
      return;
    }
    setDrafts(result.data.application_questions.map(toDraft));
    setMessage({ tone: 'success', text: 'Saved' });
  }

  return (
    <div className="stack">
      {drafts.length === 0 ? (
        <div className="panel empty">
          <strong>No custom questions</strong>
          <span>Applicants apply with their profile alone.</span>
        </div>
      ) : (
        drafts.map((draft, index) => {
          const isChoice = draft.type === 'single_choice' || draft.type === 'multi_choice';
          return (
            <section
              key={draft.key}
              className="panel card stack"
              aria-label={`Question ${index + 1}`}
            >
              <div className="row-between">
                <strong className="small muted">Question {index + 1}</strong>
                <span className="row">
                  <button
                    type="button"
                    className="link-button"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className="link-button"
                    disabled={index === drafts.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    className="link-button"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => setDrafts((current) => current.filter((_, i) => i !== index))}
                  >
                    Remove
                  </button>
                </span>
              </div>
              <div className="grid-2">
                <div className="span-2">
                  <Field label="Question" error={errors[`${index}.label`]}>
                    {(p) => (
                      <input
                        {...p}
                        className="input"
                        value={draft.label}
                        onChange={(e) => update(index, { label: e.target.value })}
                      />
                    )}
                  </Field>
                </div>
                <Field label="Answer type" error={errors[`${index}.type`]}>
                  {(p) => (
                    <select
                      {...p}
                      className="select"
                      value={draft.type}
                      onChange={(e) => update(index, { type: e.target.value as QuestionType })}
                    >
                      {QUESTION_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {TYPE_LABEL[type]}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <label className="check" style={{ alignSelf: 'end', minHeight: 44 }}>
                  <input
                    type="checkbox"
                    checked={draft.required}
                    onChange={(e) => update(index, { required: e.target.checked })}
                  />
                  Required
                </label>
                {isChoice ? (
                  <div className="span-2">
                    <Field label="Options, one per line" error={errors[`${index}.options`]}>
                      {(p) => (
                        <textarea
                          {...p}
                          className="textarea"
                          rows={4}
                          value={draft.options}
                          onChange={(e) => update(index, { options: e.target.value })}
                        />
                      )}
                    </Field>
                  </div>
                ) : null}
              </div>
            </section>
          );
        })
      )}

      <div className="row">
        <button type="button" className="btn" onClick={add}>
          Add a question
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? 'Saving…' : 'Save form'}
        </button>
        {message ? (
          message.tone === 'success' ? (
            <span className="saved" role="status">
              <CheckIcon width={14} height={14} /> {message.text}
            </span>
          ) : (
            <p className="banner banner-danger" role="alert" style={{ margin: 0 }}>
              <AlertIcon /> {message.text}
            </p>
          )
        ) : null}
      </div>
    </div>
  );
}
