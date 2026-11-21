'use client';

import { utcToZoned, zonedToUtc, type Event } from '@hx/shared';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { api } from '@/lib/client/api';
import { EVENT_MODE } from '@/lib/ui/status';
import { AlertIcon, CheckIcon } from '../icons';
import { Busy } from '@/components/loading-state';
import { useRouterTransition } from '@/lib/client/use-router-transition';

type Props =
  | { mode: 'create'; orgId: string; timezones: string[]; defaultTimezone: string }
  | { mode: 'edit'; event: Event; timezones: string[] };

const TIME_FIELDS = [
  'applications_open_at',
  'applications_close_at',
  'starts_at',
  'submission_deadline',
  'ends_at',
] as const;
type TimeField = (typeof TIME_FIELDS)[number];

interface Values extends Record<TimeField, string> {
  name: string;
  slug: string;
  description: string;
  timezone: string;
  mode: Event['mode'];
  location: string;
  team_size_min: string;
  team_size_max: string;
  max_tracks_per_submission: string;
}

function initialValues(props: Props): Values {
  if (props.mode === 'create') {
    return {
      name: '',
      slug: '',
      description: '',
      timezone: props.defaultTimezone,
      mode: 'in_person',
      location: '',
      applications_open_at: '',
      applications_close_at: '',
      starts_at: '',
      submission_deadline: '',
      ends_at: '',
      team_size_min: '1',
      team_size_max: '4',
      max_tracks_per_submission: '1',
    };
  }
  const e = props.event;
  const wall = (iso: string | null) => (iso ? utcToZoned(iso, e.timezone) : '');
  return {
    name: e.name,
    slug: e.slug,
    description: e.description,
    timezone: e.timezone,
    mode: e.mode,
    location: e.location ?? '',
    applications_open_at: wall(e.applications_open_at),
    applications_close_at: wall(e.applications_close_at),
    starts_at: wall(e.starts_at),
    submission_deadline: wall(e.submission_deadline),
    ends_at: wall(e.ends_at),
    team_size_min: String(e.team_size_min),
    team_size_max: String(e.team_size_max),
    max_tracks_per_submission: String(e.max_tracks_per_submission),
  };
}

/**
 * Create or edit an event's details. Dates are typed as wall-clock times in the event's
 * time zone and sent as UTC.
 */
export function EventForm(props: Props) {
  const navigate = useRouterTransition();
  const [values, setValues] = useState<Values>(() => initialValues(props));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null);

  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  function buildBody(): Record<string, unknown> | null {
    const local: Record<string, string> = {};
    const times: Partial<Record<TimeField, string | null>> = {};
    for (const field of TIME_FIELDS) {
      const value = values[field];
      if (!value) {
        if (field.startsWith('applications_')) times[field] = null;
        else local[field] = 'Enter a date and time.';
        continue;
      }
      times[field] = zonedToUtc(value, values.timezone);
    }
    if (Object.keys(local).length > 0) {
      setErrors(local);
      return null;
    }
    const body: Record<string, unknown> = {
      name: values.name,
      description: values.description,
      timezone: values.timezone,
      mode: values.mode,
      location: values.location,
      team_size_min: Number(values.team_size_min),
      team_size_max: Number(values.team_size_max),
      max_tracks_per_submission: Number(values.max_tracks_per_submission),
      ...times,
    };
    if (values.slug.trim()) body.slug = values.slug.trim();
    if (props.mode === 'create') {
      // A new event may leave the application window for later.
      if (body.applications_open_at === null) delete body.applications_open_at;
      if (body.applications_close_at === null) delete body.applications_close_at;
    }
    return body;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const body = buildBody();
    if (!body) return;
    setErrors({});
    setBusy(true);
    const result =
      props.mode === 'create'
        ? await api<Event>(`/orgs/${props.orgId}/events`, { method: 'POST', body })
        : await api<Event>(`/events/${props.event.id}`, { method: 'PATCH', body });
    if (!result.ok) {
      setBusy(false);
      setErrors(result.fields);
      setMessage({ tone: 'danger', text: result.message });
      return;
    }
    if (props.mode === 'create') {
      navigate.push(`/organize/${result.data.id}`, () => setBusy(false));
      return;
    }
    setValues(initialValues({ ...props, event: result.data }));
    setMessage({ tone: 'success', text: 'Saved' });
    navigate.refresh(() => setBusy(false));
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <section className="panel card stack">
        <h2 className="h2">Details</h2>
        <div className="grid-2">
          <Field label="Name" error={errors.name}>
            {(p) => (
              <input
                {...p}
                className="input"
                value={values.name}
                onChange={(e) => set('name', e.target.value)}
              />
            )}
          </Field>
          <Field
            label="Web address"
            error={errors.slug}
            hint={
              props.mode === 'create'
                ? 'Optional. Made from the name if empty.'
                : `hack.ciren.network/events/${values.slug || '…'}`
            }
          >
            {(p) => (
              <input
                {...p}
                className="input mono"
                autoCapitalize="off"
                spellCheck={false}
                value={values.slug}
                onChange={(e) => set('slug', e.target.value.toLowerCase())}
              />
            )}
          </Field>
          <div className="span-2">
            <Field
              label="Description"
              error={errors.description}
              hint="Shown on the event page. Plain text."
            >
              {(p) => (
                <textarea
                  {...p}
                  className="textarea"
                  rows={6}
                  value={values.description}
                  onChange={(e) => set('description', e.target.value)}
                />
              )}
            </Field>
          </div>
          <Field label="Format" error={errors.mode}>
            {(p) => (
              <select
                {...p}
                className="select"
                value={values.mode}
                onChange={(e) => set('mode', e.target.value as Values['mode'])}
              >
                {Object.entries(EVENT_MODE).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field
            label="Location"
            error={errors.location}
            hint="Venue, or leave empty for online events."
          >
            {(p) => (
              <input
                {...p}
                className="input"
                value={values.location}
                onChange={(e) => set('location', e.target.value)}
              />
            )}
          </Field>
        </div>
      </section>

      <section className="panel card stack">
        <div className="stack-sm">
          <h2 className="h2">Dates</h2>
          <p className="muted small" style={{ margin: 0 }}>
            Enter times in the event&apos;s time zone. Everyone sees them in their own.
          </p>
        </div>
        <div className="grid-2">
          <Field label="Event time zone" error={errors.timezone}>
            {(p) => (
              <select
                {...p}
                className="select"
                value={values.timezone}
                onChange={(e) => set('timezone', e.target.value)}
              >
                {props.timezones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <span />
          <TimeInput
            label="Applications open"
            field="applications_open_at"
            values={values}
            errors={errors}
            set={set}
          />
          <TimeInput
            label="Applications close"
            field="applications_close_at"
            values={values}
            errors={errors}
            set={set}
          />
          <TimeInput
            label="Event starts"
            field="starts_at"
            values={values}
            errors={errors}
            set={set}
          />
          <TimeInput
            label="Submission deadline"
            field="submission_deadline"
            values={values}
            errors={errors}
            set={set}
          />
          <TimeInput label="Event ends" field="ends_at" values={values} errors={errors} set={set} />
        </div>
      </section>

      <section className="panel card stack">
        <h2 className="h2">Teams and submissions</h2>
        <div className="grid-2">
          <NumberInput
            label="Smallest team"
            field="team_size_min"
            values={values}
            errors={errors}
            set={set}
          />
          <NumberInput
            label="Largest team"
            field="team_size_max"
            values={values}
            errors={errors}
            set={set}
          />
          <NumberInput
            label="Tracks a project can enter"
            field="max_tracks_per_submission"
            values={values}
            errors={errors}
            set={set}
          />
        </div>
      </section>

      <div className="row">
        <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>
          {busy ? <Busy>Saving…</Busy> : props.mode === 'create' ? 'Create draft' : 'Save changes'}
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
    </form>
  );
}

interface InputProps {
  label: string;
  field: keyof Values;
  values: Values;
  errors: Record<string, string>;
  set: <K extends keyof Values>(key: K, value: Values[K]) => void;
}

function TimeInput({ label, field, values, errors, set }: InputProps) {
  return (
    <Field label={label} error={errors[field]}>
      {(p) => (
        <input
          {...p}
          type="datetime-local"
          className="input mono"
          value={values[field]}
          onChange={(e) => set(field, e.target.value)}
        />
      )}
    </Field>
  );
}

function NumberInput({ label, field, values, errors, set }: InputProps) {
  return (
    <Field label={label} error={errors[field]}>
      {(p) => (
        <input
          {...p}
          type="number"
          min={1}
          max={20}
          className="input mono"
          value={values[field]}
          onChange={(e) => set(field, e.target.value)}
        />
      )}
    </Field>
  );
}

interface FieldControl {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby': string | undefined;
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string | undefined;
  hint?: string;
  children: (props: FieldControl) => ReactNode;
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
          <AlertIcon width={16} height={16} /> {error}
        </span>
      ) : hint ? (
        <span id={`${id}-hint`} className="hint">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
