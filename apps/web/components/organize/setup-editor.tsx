'use client';

import {
  formatDateTime,
  utcToZoned,
  zonedToUtc,
  type Award,
  type EventSetup,
  type RubricCriterion,
  type ScheduleItem,
  type Track,
} from '@hx/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import { api } from '@/lib/client/api';
import { AlertIcon } from '../icons';
import { Field } from './event-form';

type Kind = 'tracks' | 'schedule' | 'rubric' | 'awards';
type Item = Track | ScheduleItem | RubricCriterion | Award;

interface Props {
  eventId: string;
  timezone: string;
  initial: EventSetup;
}

/** Edit the four setup lists. Each change saves immediately through the API. */
export function SetupEditor({ eventId, timezone, initial }: Props) {
  const [setup, setSetup] = useState(initial);

  const replace = <K extends Kind>(kind: K, items: EventSetup[K]) =>
    setSetup((current) => ({ ...current, [kind]: items }));

  return (
    <div className="stack">
      <Section<Track>
        kind="tracks"
        title="Tracks"
        hint="Themes projects can enter, such as Health or FinTech."
        eventId={eventId}
        items={setup.tracks}
        onChange={(items) => replace('tracks', items)}
        describe={(t) => ({ title: t.name, sub: t.description })}
        empty={{ name: '', description: '' }}
        toForm={(t) => ({ name: t.name, description: t.description })}
        fromForm={(v) => ({ name: v.name, description: v.description })}
        fields={(v, set, errors) => (
          <>
            <Field label="Name" error={errors.name}>
              {(p) => (
                <input
                  {...p}
                  className="input"
                  value={v.name}
                  onChange={(e) => set('name', e.target.value)}
                />
              )}
            </Field>
            <Field label="Description" error={errors.description}>
              {(p) => (
                <input
                  {...p}
                  className="input"
                  value={v.description}
                  onChange={(e) => set('description', e.target.value)}
                />
              )}
            </Field>
          </>
        )}
      />

      <Section<ScheduleItem>
        kind="schedule"
        title="Schedule"
        hint={`Times in the event's zone, ${timezone.replaceAll('_', ' ')}.`}
        eventId={eventId}
        items={setup.schedule}
        onChange={(items) => replace('schedule', items)}
        describe={(s) => ({
          title: s.title,
          sub: [formatDateTime(s.starts_at, timezone), s.location].filter(Boolean).join(' · '),
        })}
        empty={{ title: '', starts_at: '', ends_at: '', location: '' }}
        toForm={(s) => ({
          title: s.title,
          starts_at: utcToZoned(s.starts_at, timezone),
          ends_at: s.ends_at ? utcToZoned(s.ends_at, timezone) : '',
          location: s.location ?? '',
        })}
        fromForm={(v) => ({
          title: v.title,
          starts_at: v.starts_at ? zonedToUtc(v.starts_at, timezone) : '',
          ends_at: v.ends_at ? zonedToUtc(v.ends_at, timezone) : null,
          location: v.location,
        })}
        fields={(v, set, errors) => (
          <>
            <Field label="Title" error={errors.title}>
              {(p) => (
                <input
                  {...p}
                  className="input"
                  value={v.title}
                  onChange={(e) => set('title', e.target.value)}
                />
              )}
            </Field>
            <Field label="Location" error={errors.location}>
              {(p) => (
                <input
                  {...p}
                  className="input"
                  value={v.location}
                  onChange={(e) => set('location', e.target.value)}
                />
              )}
            </Field>
            <Field label="Starts" error={errors.starts_at}>
              {(p) => (
                <input
                  {...p}
                  type="datetime-local"
                  className="input mono"
                  value={v.starts_at}
                  onChange={(e) => set('starts_at', e.target.value)}
                />
              )}
            </Field>
            <Field label="Ends (optional)" error={errors.ends_at}>
              {(p) => (
                <input
                  {...p}
                  type="datetime-local"
                  className="input mono"
                  value={v.ends_at}
                  onChange={(e) => set('ends_at', e.target.value)}
                />
              )}
            </Field>
          </>
        )}
      />

      <Section<RubricCriterion>
        kind="rubric"
        title="Rubric"
        hint="What judges score. Weights set how much each criterion counts; one can break ties."
        eventId={eventId}
        items={setup.rubric}
        onChange={(items) => replace('rubric', items)}
        describe={(r) => ({
          title: r.name,
          sub: `Out of ${r.max_score} · weight ${r.weight}${r.is_tiebreaker ? ' · tiebreaker' : ''}`,
        })}
        empty={{
          name: '',
          description: '',
          max_score: '10',
          weight: '1',
          position: '0',
          is_tiebreaker: '',
        }}
        toForm={(r) => ({
          name: r.name,
          description: r.description,
          max_score: String(r.max_score),
          weight: String(r.weight),
          position: String(r.position),
          is_tiebreaker: r.is_tiebreaker ? 'yes' : '',
        })}
        fromForm={(v) => ({
          name: v.name,
          description: v.description,
          max_score: Number(v.max_score),
          weight: Number(v.weight),
          position: Number(v.position),
          is_tiebreaker: v.is_tiebreaker === 'yes',
        })}
        fields={(v, set, errors) => (
          <>
            <Field label="Name" error={errors.name}>
              {(p) => (
                <input
                  {...p}
                  className="input"
                  value={v.name}
                  onChange={(e) => set('name', e.target.value)}
                />
              )}
            </Field>
            <Field label="Description" error={errors.description}>
              {(p) => (
                <input
                  {...p}
                  className="input"
                  value={v.description}
                  onChange={(e) => set('description', e.target.value)}
                />
              )}
            </Field>
            <Field label="Highest score" error={errors.max_score}>
              {(p) => (
                <input
                  {...p}
                  type="number"
                  min={1}
                  max={100}
                  className="input mono"
                  value={v.max_score}
                  onChange={(e) => set('max_score', e.target.value)}
                />
              )}
            </Field>
            <Field label="Weight" error={errors.weight}>
              {(p) => (
                <input
                  {...p}
                  type="number"
                  min={0.1}
                  step={0.1}
                  className="input mono"
                  value={v.weight}
                  onChange={(e) => set('weight', e.target.value)}
                />
              )}
            </Field>
            <Field label="Order" error={errors.position}>
              {(p) => (
                <input
                  {...p}
                  type="number"
                  min={0}
                  className="input mono"
                  value={v.position}
                  onChange={(e) => set('position', e.target.value)}
                />
              )}
            </Field>
            <label className="check" style={{ alignSelf: 'end', minHeight: 44 }}>
              <input
                type="checkbox"
                checked={v.is_tiebreaker === 'yes'}
                onChange={(e) => set('is_tiebreaker', e.target.checked ? 'yes' : '')}
              />
              Breaks ties
            </label>
          </>
        )}
      />

      <Section<Award>
        kind="awards"
        title="Awards"
        hint="Overall prizes, or prizes for one track. Winners are chosen after judging."
        eventId={eventId}
        items={setup.awards}
        onChange={(items) => replace('awards', items)}
        describe={(a) => ({
          title: a.name,
          sub: [
            a.track_id
              ? (setup.tracks.find((t) => t.id === a.track_id)?.name ?? 'Track')
              : 'Overall',
            a.rank ? `rank ${a.rank}` : null,
          ]
            .filter(Boolean)
            .join(' · '),
        })}
        empty={{ name: '', track_id: '', rank: '' }}
        toForm={(a) => ({
          name: a.name,
          track_id: a.track_id ?? '',
          rank: a.rank ? String(a.rank) : '',
        })}
        fromForm={(v) => ({
          name: v.name,
          track_id: v.track_id || null,
          rank: v.rank ? Number(v.rank) : null,
        })}
        fields={(v, set, errors) => (
          <>
            <Field label="Name" error={errors.name}>
              {(p) => (
                <input
                  {...p}
                  className="input"
                  value={v.name}
                  onChange={(e) => set('name', e.target.value)}
                />
              )}
            </Field>
            <Field label="Track" error={errors.track_id}>
              {(p) => (
                <select
                  {...p}
                  className="select"
                  value={v.track_id}
                  onChange={(e) => set('track_id', e.target.value)}
                >
                  <option value="">Overall</option>
                  {setup.tracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Rank (optional)" error={errors.rank} hint="1 for first place">
              {(p) => (
                <input
                  {...p}
                  type="number"
                  min={1}
                  className="input mono"
                  value={v.rank}
                  onChange={(e) => set('rank', e.target.value)}
                />
              )}
            </Field>
          </>
        )}
      />
    </div>
  );
}

type FormValues = Record<string, string>;

interface SectionProps<T extends Item> {
  kind: Kind;
  title: string;
  hint: string;
  eventId: string;
  items: T[];
  onChange: (items: T[]) => void;
  describe: (item: T) => { title: string; sub: string };
  empty: FormValues;
  toForm: (item: T) => FormValues;
  fromForm: (values: FormValues) => Record<string, unknown>;
  fields: (
    values: FormValues,
    set: (key: string, value: string) => void,
    errors: Record<string, string>,
  ) => ReactNode;
}

function Section<T extends Item>(props: SectionProps<T>) {
  const { kind, title, hint, eventId, items, onChange, describe } = props;
  // null: closed; 'new': adding; an id: editing that item.
  const [editing, setEditing] = useState<string | null>(null);
  const [values, setValues] = useState<FormValues>(props.empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  function open(target: T | 'new') {
    setEditing(target === 'new' ? 'new' : target.id);
    setValues(target === 'new' ? props.empty : props.toForm(target));
    setErrors({});
    setFailure(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const body = props.fromForm(values);
    const result =
      editing === 'new'
        ? await api<T>(`/events/${eventId}/${kind}`, { method: 'POST', body })
        : await api<T>(`/events/${eventId}/${kind}/${editing}`, { method: 'PATCH', body });
    if (!result.ok) {
      setBusy(false);
      setErrors(result.fields);
      setFailure(Object.keys(result.fields).length === 0 ? result.message : null);
      return;
    }
    // Refetch the list: saving one rubric tiebreaker can clear another.
    const list = await api<{ items: T[] }>(`/events/${eventId}/${kind}`);
    setBusy(false);
    if (list.ok) onChange(list.data.items);
    setEditing(null);
  }

  async function remove(item: T) {
    if (!window.confirm(`Delete “${describe(item).title}”?`)) return;
    setFailure(null);
    const result = await api<null>(`/events/${eventId}/${kind}/${item.id}`, { method: 'DELETE' });
    if (!result.ok) {
      setFailure(result.message);
      return;
    }
    onChange(items.filter((i) => i.id !== item.id));
  }

  const form = (
    <form className="inset card stack" onSubmit={save} noValidate style={{ borderRadius: 24 }}>
      <div className="grid-2">
        {props.fields(values, (key, value) => setValues((v) => ({ ...v, [key]: value })), errors)}
      </div>
      <div className="row">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setEditing(null)}>
          Cancel
        </button>
      </div>
    </form>
  );

  return (
    <section className="raised card stack" aria-labelledby={`${kind}-title`}>
      <div className="row-between">
        <div className="stack-sm" style={{ gap: 2 }}>
          <h2 id={`${kind}-title`} className="h2">
            {title}
          </h2>
          <span className="muted small">{hint}</span>
        </div>
        {editing === null ? (
          <button type="button" className="btn btn-sm" onClick={() => open('new')}>
            Add
          </button>
        ) : null}
      </div>

      {failure ? (
        <p className="banner banner-danger" role="alert" style={{ margin: 0 }}>
          <AlertIcon /> {failure}
        </p>
      ) : null}

      {items.length === 0 && editing !== 'new' ? (
        <p className="muted small" style={{ margin: 0 }}>
          None yet.
        </p>
      ) : (
        <ul className="stack-sm" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {items.map((item) =>
            editing === item.id ? (
              <li key={item.id}>{form}</li>
            ) : (
              <li key={item.id} className="row-between" style={{ padding: '6px 0' }}>
                <span>
                  <strong>{describe(item).title}</strong>
                  {describe(item).sub ? (
                    <span className="muted small"> · {describe(item).sub}</span>
                  ) : null}
                </span>
                <span className="row">
                  <button type="button" className="link-button" onClick={() => open(item)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="link-button"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => void remove(item)}
                  >
                    Delete
                  </button>
                </span>
              </li>
            ),
          )}
        </ul>
      )}
      {editing === 'new' ? form : null}
    </section>
  );
}
