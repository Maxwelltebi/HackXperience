'use client';

import type { Answers, ApplicationQuestion, MyApplication } from '@hx/shared';
import Link from '@/components/link';
import { useId, useState, type FormEvent } from 'react';
import { api } from '@/lib/client/api';
import { AlertIcon } from './icons';
import { Busy } from '@/components/loading-state';
import { useRouterTransition } from '@/lib/client/use-router-transition';

interface Props {
  eventId: string;
  slug: string;
  questions: ApplicationQuestion[];
  profileComplete: boolean;
}

/** Renders the event's custom questions and submits them. Field errors come back per question. */
export function ApplicationForm({ eventId, slug, questions, profileComplete }: Props) {
  const navigate = useRouterTransition();
  const [answers, setAnswers] = useState<Answers>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const set = (id: string, value: string | string[]) =>
    setAnswers((current) => ({ ...current, [id]: value }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFailure(null);
    const result = await api<MyApplication>(`/events/${eventId}/applications`, {
      method: 'POST',
      body: { answers },
    });
    if (result.ok) {
      navigate.push(`/events/${slug}`, () => setBusy(false));
      return;
    }
    setBusy(false);
    setErrors(result.fields);
    if (Object.keys(result.fields).length === 0) setFailure(result.message);
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      {!profileComplete ? (
        <p className="banner banner-warning" style={{ margin: 0 }}>
          <AlertIcon /> Organizers see your school and level of study from your profile.{' '}
          <Link href="/profile">Fill them in</Link>
        </p>
      ) : null}

      <section className="panel card stack">
        {questions.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No questions for this event. Submit to apply with your profile.
          </p>
        ) : (
          questions.map((question) => (
            <Question
              key={question.id}
              question={question}
              value={answers[question.id]}
              error={errors[`answers.${question.id}`]}
              onChange={(value) => set(question.id, value)}
            />
          ))
        )}
      </section>

      {failure ? (
        <p className="banner banner-danger" role="alert" style={{ margin: 0 }}>
          <AlertIcon /> {failure}
        </p>
      ) : null}

      <div className="row">
        <button
          className="btn btn-primary btn-lg"
          type="submit"
          disabled={busy || navigate.pending}
        >
          {busy ? <Busy>Sending…</Busy> : 'Submit application'}
        </button>
        <Link href={`/events/${slug}`}>Cancel</Link>
      </div>
    </form>
  );
}

function Question({
  question,
  value,
  error,
  onChange,
}: {
  question: ApplicationQuestion;
  value: string | string[] | undefined;
  error: string | undefined;
  onChange: (value: string | string[]) => void;
}) {
  const id = useId();
  const label = (
    <>
      {question.label}
      {question.required ? null : <span className="muted"> · optional</span>}
    </>
  );
  const errorNode = error ? (
    <span id={`${id}-error`} className="field-error">
      {error}
    </span>
  ) : null;
  const common = {
    id,
    'aria-invalid': Boolean(error),
    'aria-describedby': error ? `${id}-error` : undefined,
    required: question.required,
  };

  if (question.type === 'single_choice' || question.type === 'multi_choice') {
    const multi = question.type === 'multi_choice';
    const selected = Array.isArray(value) ? value : value ? [value] : [];
    return (
      <fieldset className="choice-list" aria-describedby={error ? `${id}-error` : undefined}>
        <legend>{label}</legend>
        {question.options?.map((option) => (
          <label key={option} className="check">
            <input
              type={multi ? 'checkbox' : 'radio'}
              name={id}
              checked={selected.includes(option)}
              onChange={(e) => {
                if (!multi) onChange(option);
                else
                  onChange(
                    e.target.checked ? [...selected, option] : selected.filter((o) => o !== option),
                  );
              }}
            />
            {option}
          </label>
        ))}
        {errorNode}
      </fieldset>
    );
  }

  const text = typeof value === 'string' ? value : '';
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {question.type === 'long_text' ? (
        <textarea
          {...common}
          className="textarea"
          maxLength={5000}
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          {...common}
          className="input"
          type={question.type === 'url' ? 'url' : 'text'}
          inputMode={question.type === 'url' ? 'url' : undefined}
          placeholder={question.type === 'url' ? 'https://' : undefined}
          maxLength={question.type === 'url' ? 500 : 300}
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {errorNode}
    </div>
  );
}
