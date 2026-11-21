'use client';

import {
  API_PREFIX,
  errorBodySchema,
  fieldErrorsOf,
  meResponseSchema,
  patchProfileBodySchema,
  type MeResponse,
  type PatchProfileInput,
} from '@hx/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { AlertIcon, CheckIcon } from './icons';
import styles from './profile-form.module.css';
import { Busy } from '@/components/loading-state';

const LEVELS = ['Secondary school', 'Undergraduate', 'Postgraduate', 'Graduated', 'Other'];
const GENDERS = ['Woman', 'Man', 'Non-binary', 'Prefer not to say'];

interface Values {
  name: string;
  timezone: string;
  email_reminders: boolean;
  school: string;
  level_of_study: string;
  graduation_year: string;
  country: string;
  github_username: string;
  bio: string;
  gender: string;
}

type Status =
  { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: number } | { kind: 'failed' };

function toValues(me: MeResponse): Values {
  const p = me.profile;
  return {
    name: me.user.name,
    timezone: p.timezone,
    email_reminders: p.email_reminders,
    school: p.school ?? '',
    level_of_study: p.level_of_study ?? '',
    graduation_year: p.graduation_year?.toString() ?? '',
    country: p.country ?? '',
    github_username: p.github_username ?? '',
    bio: p.bio ?? '',
    gender: p.gender ?? '',
  };
}

function toBody(values: Values): PatchProfileInput {
  const year = values.graduation_year.trim();
  return {
    name: values.name,
    timezone: values.timezone,
    email_reminders: values.email_reminders,
    school: values.school,
    level_of_study: values.level_of_study,
    graduation_year: year === '' ? null : Number(year),
    country: values.country,
    github_username: values.github_username,
    bio: values.bio,
    gender: values.gender,
  };
}

export function ProfileForm({ initial, timezones }: { initial: MeResponse; timezones: string[] }) {
  const [values, setValues] = useState<Values>(() => toValues(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const router = useRouter();

  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function save() {
    const body = toBody(values);
    const local = patchProfileBodySchema.safeParse(body);
    if (!local.success) {
      setErrors(Object.fromEntries(local.error.issues.map((i) => [i.path.join('.'), i.message])));
      return;
    }
    setErrors({});
    setStatus({ kind: 'saving' });
    try {
      const response = await fetch(`${API_PREFIX}/me/profile`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json: unknown = await response.json();
      if (response.ok) {
        setValues(toValues(meResponseSchema.parse(json)));
        setStatus({ kind: 'saved', at: Date.now() });
        return;
      }
      const error = errorBodySchema.safeParse(json);
      const fields = error.success ? fieldErrorsOf(error.data.error.details) : {};
      if (Object.keys(fields).length > 0) {
        setErrors(fields);
        setStatus({ kind: 'idle' });
        return;
      }
      if (response.status === 401) {
        router.push('/sign-in?next=/profile');
        return;
      }
      setStatus({ kind: 'failed' });
    } catch {
      setStatus({ kind: 'failed' });
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save();
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <section className={`panel ${styles.card}`} aria-labelledby="about-title">
        <div className={styles.cardHead}>
          <h2 id="about-title" className="h2">
            About you
          </h2>
          <p className="muted small">
            Your name, school and GitHub username appear on your public profile.
          </p>
        </div>
        <div className={styles.grid}>
          <Field label="Name" error={errors.name}>
            {(props) => (
              <input
                {...props}
                className="input"
                autoComplete="name"
                value={values.name}
                onChange={(e) => set('name', e.target.value)}
              />
            )}
          </Field>
          <Field
            label="GitHub username"
            error={errors.github_username}
            hint="Just the username, not a link"
          >
            {(props) => (
              <input
                {...props}
                className="input mono"
                autoCapitalize="off"
                spellCheck={false}
                value={values.github_username}
                onChange={(e) => set('github_username', e.target.value)}
              />
            )}
          </Field>
          <Field label="School" error={errors.school}>
            {(props) => (
              <input
                {...props}
                className="input"
                autoComplete="organization"
                value={values.school}
                onChange={(e) => set('school', e.target.value)}
              />
            )}
          </Field>
          <Field label="Level of study" error={errors.level_of_study}>
            {(props) => (
              <select
                {...props}
                className="select"
                value={values.level_of_study}
                onChange={(e) => set('level_of_study', e.target.value)}
              >
                <option value="">Not set</option>
                {withCurrent(LEVELS, values.level_of_study).map((level) => (
                  <option key={level}>{level}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Graduation year" error={errors.graduation_year}>
            {(props) => (
              <input
                {...props}
                className="input mono"
                inputMode="numeric"
                maxLength={4}
                value={values.graduation_year}
                onChange={(e) => set('graduation_year', e.target.value.replace(/\D/g, ''))}
              />
            )}
          </Field>
          <Field label="Country" error={errors.country}>
            {(props) => (
              <input
                {...props}
                className="input"
                autoComplete="country-name"
                value={values.country}
                onChange={(e) => set('country', e.target.value)}
              />
            )}
          </Field>
          <Field
            label="Gender"
            error={errors.gender}
            hint="Optional. Only counted in anonymous attendance reports."
          >
            {(props) => (
              <select
                {...props}
                className="select"
                value={values.gender}
                onChange={(e) => set('gender', e.target.value)}
              >
                <option value="">Not set</option>
                {withCurrent(GENDERS, values.gender).map((gender) => (
                  <option key={gender}>{gender}</option>
                ))}
              </select>
            )}
          </Field>
          <div className={styles.full}>
            <Field label="Bio" error={errors.bio}>
              {(props) => (
                <textarea
                  {...props}
                  className="textarea"
                  maxLength={1000}
                  value={values.bio}
                  onChange={(e) => set('bio', e.target.value)}
                />
              )}
            </Field>
          </div>
        </div>
      </section>

      <section className={`panel ${styles.card}`} aria-labelledby="settings-title">
        <div className={styles.cardHead}>
          <h2 id="settings-title" className="h2">
            Settings
          </h2>
          <p className="muted small">Times across HackXperience show in this time zone.</p>
        </div>
        <div className={styles.grid}>
          <Field label="Time zone" error={errors.timezone}>
            {(props) => (
              <select
                {...props}
                className="select"
                value={values.timezone}
                onChange={(e) => set('timezone', e.target.value)}
              >
                {timezones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <div className="field" style={{ alignContent: 'end' }}>
            <label className="switch">
              <input
                type="checkbox"
                checked={values.email_reminders}
                onChange={(e) => set('email_reminders', e.target.checked)}
              />
              <span className="switch-track" aria-hidden="true">
                <span className="switch-thumb" />
              </span>
              Email reminders {values.email_reminders ? 'on' : 'off'}
            </label>
            <span className="hint">
              Deadline reminders, 24 hours and 1 hour before submissions close.
            </span>
          </div>
        </div>
      </section>

      <div className={styles.footer}>
        <button
          className="btn btn-primary btn-lg"
          type="submit"
          disabled={status.kind === 'saving'}
        >
          {status.kind === 'saving' ? <Busy>Saving…</Busy> : 'Save profile'}
        </button>
        <SaveStatus status={status} onRetry={() => void save()} />
      </div>
    </form>
  );
}

interface FieldControlProps {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby': string | undefined;
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error: string | undefined;
  hint?: string;
  children: (props: FieldControlProps) => ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {error ? (
        <span id={`${id}-error`} className="field-error">
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-hint`} className="hint">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

function SaveStatus({ status, onRetry }: { status: Status; onRetry: () => void }) {
  const now = useNow(status.kind === 'saved');
  if (status.kind === 'failed') {
    return (
      <p className="banner banner-danger" role="alert" style={{ margin: 0 }}>
        <AlertIcon /> Couldn&apos;t save. Check your connection and try again.
        <button type="button" className="btn" onClick={onRetry}>
          Retry
        </button>
      </p>
    );
  }
  if (status.kind === 'saved') {
    return (
      <span className="saved" role="status">
        <CheckIcon width={14} height={14} /> Saved {formatAgo(now - status.at)}
      </span>
    );
  }
  return null;
}

/** Re-renders every few seconds while `active`, for "Saved 12 s ago". */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

function formatAgo(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds} s ago`;
  return `${Math.floor(seconds / 60)} min ago`;
}

function withCurrent(options: string[], current: string): string[] {
  return current && !options.includes(current) ? [current, ...options] : options;
}
