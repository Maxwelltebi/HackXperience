'use client';

import {
  IF_MATCH_HEADER,
  liveTopics,
  SUBMISSION_LIMITS,
  type Submission,
  type Track,
} from '@hx/shared';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/client/api';
import { useLiveChannel } from '@/lib/client/use-live-channel';
import { chipClass, SHA_STATUS, SUBMISSION_STATUS } from '@/lib/ui/status';
import { Countdown } from '../countdown';
import { AlertIcon, CheckIcon } from '../icons';
import { Field } from '../organize/event-form';
import styles from './submission-editor.module.css';

// The markdown renderer loads only when someone opens a preview.
const Markdown = dynamic(() => import('../markdown'), {
  loading: () => <p className="muted small">Loading preview…</p>,
});

interface Props {
  eventId: string;
  teamId: string;
  viewerId: string;
  initial: Submission;
  tracks: Track[];
  maxTracks: number;
  memberCount: number;
  teamSizeMin: number;
  deadline: string;
  serverNow: string;
  /** Past the deadline or locked when the page was rendered. */
  closed: boolean;
}

interface Draft {
  title: string;
  tagline: string;
  write_up: string;
  github_url: string;
  youtube_url: string;
  demo_url: string;
  track_ids: string[];
}

type Notice = { tone: 'success' | 'danger' | 'warning'; text: string } | null;

function toDraft(s: Submission): Draft {
  return {
    title: s.title,
    tagline: s.tagline,
    write_up: s.write_up,
    github_url: s.github_url ?? '',
    youtube_url: s.youtube_url ?? '',
    demo_url: s.demo_url ?? '',
    track_ids: s.track_ids,
  };
}

function sameDraft(a: Draft, b: Draft): boolean {
  return (
    a.title === b.title &&
    a.tagline === b.tagline &&
    a.write_up === b.write_up &&
    a.github_url === b.github_url &&
    a.youtube_url === b.youtube_url &&
    a.demo_url === b.demo_url &&
    [...a.track_ids].sort().join() === [...b.track_ids].sort().join()
  );
}

export function SubmissionEditor(props: Props) {
  const { eventId, tracks, maxTracks, memberCount, teamSizeMin } = props;
  const router = useRouter();
  const [saved, setSaved] = useState(props.initial);
  const [draft, setDraft] = useState(() => toDraft(props.initial));
  const [closed, setClosed] = useState(props.closed);
  const [conflict, setConflict] = useState<Submission | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<'save' | 'submit' | null>(null);
  const dirty = !sameDraft(draft, toDraft(saved));
  const [newer, setNewer] = useState<number | null>(null);

  // "A teammate saved": hints on team:{id} carry the saved submission version.
  useLiveChannel(
    closed ? null : liveTopics.team(props.teamId),
    async () => null,
    (hint) => {
      if (hint.type === 'submission.saved' && hint.by !== props.viewerId) {
        setNewer((n) => Math.max(n ?? 0, hint.version));
      }
      return true;
    },
  );

  async function loadTheirs() {
    const result = await api<Submission>(`/events/${eventId}/teams/me/submission`);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNewer(null);
    if (dirty) {
      setConflict(result.data);
    } else {
      setSaved(result.data);
      setDraft(toDraft(result.data));
      setNotice({ tone: 'success', text: "Loaded your teammate's version." });
    }
  }

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty || closed) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, closed]);

  const onExpire = useCallback(() => {
    setClosed(true);
    router.refresh();
  }, [router]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  /** PUT with If-Match. Returns the saved submission, or null after showing the problem. */
  async function save(version: number, body: Draft): Promise<Submission | null> {
    const result = await api<Submission>(`/events/${eventId}/teams/me/submission`, {
      method: 'PUT',
      body,
      headers: { [IF_MATCH_HEADER]: String(version) },
    });
    if (result.ok) {
      setSaved(result.data);
      setDraft(toDraft(result.data));
      setFields({});
      setConflict(null);
      return result.data;
    }
    setFields(result.fields);
    if (result.code === 'STALE_VERSION') {
      const current = result.details?.current as Submission | undefined;
      if (current) setConflict(current);
      setNotice(null);
    } else if (result.code === 'SUBMISSION_LOCKED') {
      setClosed(true);
      setNotice({ tone: 'danger', text: result.message });
      router.refresh();
    } else {
      setNotice({ tone: 'danger', text: result.message });
    }
    return null;
  }

  async function onSave() {
    setBusy('save');
    const result = await save(saved.version, draft);
    setBusy(null);
    if (result) setNotice({ tone: 'success', text: 'Saved. Your teammates see this version.' });
  }

  async function onSubmit() {
    setBusy('submit');
    if (dirty && !(await save(saved.version, draft))) {
      setBusy(null);
      return;
    }
    const result = await api<Submission>(`/events/${eventId}/teams/me/submission/submit`, {
      method: 'POST',
    });
    setBusy(null);
    if (!result.ok) {
      setFields(result.fields);
      if (result.code === 'SUBMISSION_LOCKED') setClosed(true);
      setNotice({ tone: 'danger', text: result.message });
      return;
    }
    setSaved(result.data);
    setDraft(toDraft(result.data));
    setNotice({
      tone: 'success',
      text: 'Submitted. You can keep editing until the deadline; it stays submitted.',
    });
    router.refresh();
  }

  if (conflict) {
    return (
      <ConflictView
        mine={draft}
        theirs={conflict}
        tracks={tracks}
        busy={busy !== null}
        onUseTheirs={() => {
          setSaved(conflict);
          setDraft(toDraft(conflict));
          setConflict(null);
          setNotice({ tone: 'success', text: "Loaded your teammate's version." });
        }}
        onKeepMine={async () => {
          setBusy('save');
          const result = await save(conflict.version, draft);
          setBusy(null);
          if (result) setNotice({ tone: 'success', text: 'Saved your version over theirs.' });
        }}
      />
    );
  }

  const tooSmall = memberCount < teamSizeMin;
  const status = SUBMISSION_STATUS[saved.status];

  return (
    <div className={styles.layout}>
      <div className="stack">
        {notice ? (
          <p className={`banner banner-${notice.tone}`} role="status" style={{ margin: 0 }}>
            {notice.tone === 'success' ? <CheckIcon /> : <AlertIcon />} {notice.text}
          </p>
        ) : null}
        {newer !== null && newer > saved.version && !closed ? (
          <p className="banner banner-warning" role="status" style={{ margin: 0 }}>
            <AlertIcon /> A teammate saved a newer version.
            <button className="btn" type="button" onClick={() => void loadTheirs()}>
              {dirty ? 'Compare' : 'Load it'}
            </button>
          </p>
        ) : null}
        {closed ? (
          <ReadOnly submission={saved} tracks={tracks} />
        ) : (
          <section className="raised card stack" aria-label="Project details">
            <Field label="Project title" error={fields.title}>
              {(p) => (
                <input
                  {...p}
                  className="input"
                  value={draft.title}
                  maxLength={SUBMISSION_LIMITS.title}
                  onChange={(e) => set('title', e.target.value)}
                />
              )}
            </Field>
            <Field label="Tagline" error={fields.tagline} hint="One line that says what it does.">
              {(p) => (
                <input
                  {...p}
                  className="input"
                  value={draft.tagline}
                  maxLength={SUBMISSION_LIMITS.tagline}
                  onChange={(e) => set('tagline', e.target.value)}
                />
              )}
            </Field>
            <WriteUp
              value={draft.write_up}
              error={fields.write_up}
              onChange={(v) => set('write_up', v)}
            />
            <div className={styles.links}>
              <Field label="GitHub repository" error={fields.github_url} hint="Optional. Public.">
                {(p) => (
                  <input
                    {...p}
                    className="input"
                    inputMode="url"
                    placeholder="https://github.com/owner/repo"
                    value={draft.github_url}
                    onChange={(e) => set('github_url', e.target.value)}
                  />
                )}
              </Field>
              <Field label="YouTube video" error={fields.youtube_url} hint="Optional.">
                {(p) => (
                  <input
                    {...p}
                    className="input"
                    inputMode="url"
                    placeholder="https://youtu.be/…"
                    value={draft.youtube_url}
                    onChange={(e) => set('youtube_url', e.target.value)}
                  />
                )}
              </Field>
              <Field label="Demo link" error={fields.demo_url} hint="Optional. https only.">
                {(p) => (
                  <input
                    {...p}
                    className="input"
                    inputMode="url"
                    placeholder="https://"
                    value={draft.demo_url}
                    onChange={(e) => set('demo_url', e.target.value)}
                  />
                )}
              </Field>
            </div>
            {tracks.length > 0 ? (
              <TrackPicker
                tracks={tracks}
                max={maxTracks}
                selected={draft.track_ids}
                error={fields.track_ids}
                onChange={(ids) => set('track_ids', ids)}
              />
            ) : null}
          </section>
        )}
      </div>

      <aside className={styles.side}>
        <section className="raised card stack" aria-label="Status">
          <div className="row-between">
            <span className="muted small">Status</span>
            <span className={chipClass(status.tone)}>
              {saved.auto_submitted ? 'Auto-submitted' : status.label}
            </span>
          </div>
          {closed ? (
            <p className="small" style={{ margin: 0 }}>
              Submissions are closed.
            </p>
          ) : (
            <p className="small" style={{ margin: 0 }}>
              Closes in{' '}
              <Countdown
                deadline={props.deadline}
                serverNow={props.serverNow}
                onExpire={onExpire}
              />
            </p>
          )}
          {saved.github_url && saved.sha_status !== 'none' ? (
            <p className="small" style={{ margin: 0 }}>
              <span className={chipClass(SHA_STATUS[saved.sha_status].tone)}>
                {SHA_STATUS[saved.sha_status].label}
              </span>
              {saved.locked_commit_sha ? (
                <span className="mono" style={{ display: 'block', marginTop: 8 }}>
                  {saved.locked_commit_sha.slice(0, 12)}
                </span>
              ) : null}
            </p>
          ) : null}
          {!closed ? (
            <>
              {tooSmall ? (
                <p className="banner banner-warning" style={{ margin: 0 }}>
                  <AlertIcon /> Teams need at least {teamSizeMin} people to submit. Yours has{' '}
                  {memberCount}.
                </p>
              ) : null}
              <button
                className="btn btn-block"
                type="button"
                disabled={busy !== null || !dirty}
                onClick={onSave}
              >
                {busy === 'save' ? 'Saving…' : dirty ? 'Save draft' : 'All changes saved'}
              </button>
              {saved.status === 'submitted' ? (
                <p className="saved" style={{ margin: 0 }}>
                  <CheckIcon /> Submitted. Edits you save are included.
                </p>
              ) : (
                <button
                  className="btn btn-primary btn-block btn-lg"
                  type="button"
                  disabled={busy !== null || tooSmall}
                  onClick={onSubmit}
                >
                  {busy === 'submit' ? 'Submitting…' : 'Submit project'}
                </button>
              )}
              <p className="muted small" style={{ margin: 0 }}>
                At the deadline, a draft with a title and a write-up is submitted for you.
              </p>
            </>
          ) : null}
        </section>
      </aside>
    </div>
  );
}

function WriteUp({
  value,
  error,
  onChange,
}: {
  value: string;
  error: string | undefined;
  onChange: (value: string) => void;
}) {
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  return (
    <div className="field">
      <div className="row-between">
        <span className="label" id="writeup-label">
          Write-up
        </span>
        <div className="tabs" role="tablist" aria-label="Write-up view">
          <button
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === 'write'}
            onClick={() => setTab('write')}
          >
            Write
          </button>
          <button
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === 'preview'}
            onClick={() => setTab('preview')}
          >
            Preview
          </button>
        </div>
      </div>
      {tab === 'write' ? (
        <textarea
          className="textarea"
          aria-labelledby="writeup-label"
          aria-invalid={Boolean(error)}
          rows={14}
          maxLength={SUBMISSION_LIMITS.writeUp}
          placeholder="What problem does it solve, how does it work, what did you build it with? Markdown works."
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <div className={`inset ${styles.preview}`}>
          {value.trim() ? (
            <Markdown text={value} />
          ) : (
            <p className="muted">Nothing to preview yet.</p>
          )}
        </div>
      )}
      {error ? (
        <span className="field-error">{error}</span>
      ) : (
        <span className="hint">
          Markdown: **bold**, # headings, - lists, [links](https://…).{' '}
          <span className="mono">
            {value.length.toLocaleString()} / {SUBMISSION_LIMITS.writeUp.toLocaleString()}
          </span>
        </span>
      )}
    </div>
  );
}

function TrackPicker({
  tracks,
  max,
  selected,
  error,
  onChange,
}: {
  tracks: Track[];
  max: number;
  selected: string[];
  error: string | undefined;
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((t) => t !== id));
    else if (max === 1) onChange([id]);
    else if (selected.length < max) onChange([...selected, id]);
  };
  return (
    <fieldset className={styles.tracks}>
      <legend className="label">{max === 1 ? 'Track' : `Tracks (up to ${max})`}</legend>
      <div className={styles.trackList}>
        {tracks.map((track) => {
          const on = selected.includes(track.id);
          return (
            <button
              key={track.id}
              type="button"
              className="btn btn-sm"
              aria-pressed={on}
              disabled={!on && max > 1 && selected.length >= max}
              title={track.description || undefined}
              onClick={() => toggle(track.id)}
            >
              {on ? <CheckIcon /> : null}
              {track.name}
            </button>
          );
        })}
      </div>
      {error ? <span className="field-error">{error}</span> : null}
    </fieldset>
  );
}

function ReadOnly({ submission, tracks }: { submission: Submission; tracks: Track[] }) {
  const names = tracks.filter((t) => submission.track_ids.includes(t.id)).map((t) => t.name);
  return (
    <section className="raised card stack" aria-label="Your submission">
      <div>
        <h2 className="h2">{submission.title || 'Untitled'}</h2>
        {submission.tagline ? (
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {submission.tagline}
          </p>
        ) : null}
      </div>
      {submission.write_up.trim() ? (
        <Markdown text={submission.write_up} />
      ) : (
        <p className="muted">No write-up.</p>
      )}
      <dl className="dl">
        <LinkRow label="GitHub" url={submission.github_url} />
        <LinkRow label="Video" url={submission.youtube_url} />
        <LinkRow label="Demo" url={submission.demo_url} />
        {names.length > 0 ? (
          <>
            <dt>Tracks</dt>
            <dd className="small">{names.join(', ')}</dd>
          </>
        ) : null}
      </dl>
      {submission.status === 'draft' ? (
        <p className="banner banner-warning" style={{ margin: 0 }}>
          <AlertIcon /> This draft wasn&apos;t submitted: it had no title or no write-up at the
          deadline.
        </p>
      ) : null}
    </section>
  );
}

function LinkRow({ label, url }: { label: string; url: string | null }): ReactNode {
  if (!url) return null;
  return (
    <>
      <dt>{label}</dt>
      <dd className="small">
        <a href={url} target="_blank" rel="noopener noreferrer nofollow">
          {url}
        </a>
      </dd>
    </>
  );
}

/** The save-conflict screen: a teammate saved first. Shows only the fields that differ. */
function ConflictView({
  mine,
  theirs,
  tracks,
  busy,
  onUseTheirs,
  onKeepMine,
}: {
  mine: Draft;
  theirs: Submission;
  tracks: Track[];
  busy: boolean;
  onUseTheirs: () => void;
  onKeepMine: () => void;
}) {
  const other = toDraft(theirs);
  const trackNames = (ids: string[]) =>
    tracks
      .filter((t) => ids.includes(t.id))
      .map((t) => t.name)
      .join(', ') || 'None';
  const rows: { label: string; mine: string; theirs: string }[] = [
    { label: 'Title', mine: mine.title, theirs: other.title },
    { label: 'Tagline', mine: mine.tagline, theirs: other.tagline },
    { label: 'Write-up', mine: mine.write_up, theirs: other.write_up },
    { label: 'GitHub', mine: mine.github_url, theirs: other.github_url },
    { label: 'Video', mine: mine.youtube_url, theirs: other.youtube_url },
    { label: 'Demo', mine: mine.demo_url, theirs: other.demo_url },
    { label: 'Tracks', mine: trackNames(mine.track_ids), theirs: trackNames(other.track_ids) },
  ].filter((r) => r.mine !== r.theirs);

  return (
    <section className="raised card stack" aria-labelledby="conflict-title">
      <div>
        <h2 id="conflict-title" className="h2">
          A teammate saved first
        </h2>
        <p className="muted" style={{ margin: '6px 0 0' }}>
          Their version is newer than the one you started editing. Choose which to keep. Nothing is
          lost until you choose.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="small">Your changes match theirs. Use theirs to carry on.</p>
      ) : (
        <div className={styles.compare}>
          <span className="muted small">Field</span>
          <span className="muted small">Yours (not saved)</span>
          <span className="muted small">Your teammate&apos;s (saved)</span>
          {rows.map((row) => (
            <div key={row.label} className={styles.compareRow}>
              <strong className="small">{row.label}</strong>
              <div className={`inset ${styles.cell}`}>{row.mine || '(empty)'}</div>
              <div className={`inset ${styles.cell}`}>{row.theirs || '(empty)'}</div>
            </div>
          ))}
        </div>
      )}
      <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
        <button className="btn" type="button" disabled={busy} onClick={onUseTheirs}>
          Use theirs
        </button>
        <button className="btn btn-primary" type="button" disabled={busy} onClick={onKeepMine}>
          {busy ? 'Saving…' : 'Keep mine'}
        </button>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Keep mine saves your version over theirs. Use theirs drops your unsaved changes.
      </p>
    </section>
  );
}
