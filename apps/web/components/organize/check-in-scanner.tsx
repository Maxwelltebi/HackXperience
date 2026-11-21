'use client';

import { formatTime, type Attendee, type CheckInResult, type CheckInStats } from '@hx/shared';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from 'react';
import { api } from '@/lib/client/api';
import { AlertIcon, CheckIcon } from '../icons';
import styles from './check-in-scanner.module.css';

interface Props {
  eventId: string;
  eventName: string;
  timezone: string;
  canManual: boolean;
  initialStats: CheckInStats;
}

type Outcome =
  | { kind: 'ok'; result: CheckInResult }
  | { kind: 'already'; name: string; at: string | null }
  | { kind: 'error'; message: string };

/** Minimal typing for the browser's built-in QR reader (Chrome on Android, Edge, Samsung). */
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (options: { formats: string[] }) => BarcodeDetectorLike;
  }
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** Online only (DESIGN Step 1): offline, the scanner says so and does not scan. */
function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

export function CheckInScanner({ eventId, eventName, timezone, canManual, initialStats }: Props) {
  const online = useOnline();
  const [unreachable, setUnreachable] = useState(false);
  const offline = !online || unreachable;
  const [stats, setStats] = useState(initialStats);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanning = useRef(true);

  const refreshStats = useCallback(async () => {
    const result = await api<CheckInStats>(`/events/${eventId}/check-ins/stats`);
    if (result.ok) {
      setStats(result.data);
      setUnreachable(false);
    } else if (result.code === 'NETWORK') {
      setUnreachable(true);
    }
  }, [eventId]);

  const submit = useCallback(
    async (request: () => Promise<Awaited<ReturnType<typeof api<CheckInResult>>>>) => {
      scanning.current = false;
      setBusy(true);
      const result = await request();
      setBusy(false);
      if (result.ok) {
        setOutcome({ kind: 'ok', result: result.data });
        setUnreachable(false);
        void refreshStats();
        return;
      }
      if (result.code === 'NETWORK') {
        setUnreachable(true);
        scanning.current = true;
        return;
      }
      if (result.code === 'ALREADY_CHECKED_IN') {
        const details = result.details ?? {};
        setOutcome({
          kind: 'already',
          name: typeof details.name === 'string' ? details.name : 'This person',
          at: typeof details.checked_in_at === 'string' ? details.checked_in_at : null,
        });
        return;
      }
      setOutcome({ kind: 'error', message: result.message });
    },
    [refreshStats],
  );

  const checkInCode = useCallback(
    (code: string) =>
      submit(() =>
        api<CheckInResult>(`/events/${eventId}/check-ins`, {
          method: 'POST',
          body: { ticket_code: code },
        }),
      ),
    [eventId, submit],
  );

  // Camera and decode loop. Only runs while online; pauses while a result is on screen.
  useEffect(() => {
    if (offline) return;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let stopped = false;
    const canvas = document.createElement('canvas');

    async function decode(video: HTMLVideoElement): Promise<string | null> {
      if (window.BarcodeDetector) {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const [code] = await detector.detect(video);
        return code?.rawValue ?? null;
      }
      const { default: jsQR } = await import('jsqr');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context || canvas.width === 0) return null;
      context.drawImage(video, 0, 0);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      return jsQR(image.data, image.width, image.height)?.data ?? null;
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(async (media) => {
        if (stopped) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = media;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = media;
        await video.play();
        setCameraError(null);
        timer = window.setInterval(() => {
          if (!scanning.current || video.readyState < 2) return;
          decode(video)
            .then((code) => {
              if (code && scanning.current) void checkInCode(code.trim());
            })
            .catch(() => {});
        }, 300);
      })
      .catch(() => {
        setCameraError(
          'The camera is blocked or missing. Allow camera access, or type the ticket code below.',
        );
      });

    return () => {
      stopped = true;
      window.clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [offline, checkInCode]);

  // Keep the count fresh while other volunteers scan at other doors.
  useEffect(() => {
    const timer = window.setInterval(() => void refreshStats(), 30_000);
    return () => window.clearInterval(timer);
  }, [refreshStats]);

  function next() {
    setOutcome(null);
    setTyped('');
    scanning.current = true;
  }

  function submitTyped(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (typed.trim()) void checkInCode(typed.trim());
  }

  return (
    <div className={styles.wrap}>
      <div className="row-between">
        <div>
          <h1 className="h1">Check-in</h1>
          <span className="muted small">{eventName}</span>
        </div>
        <span className={offline ? 'chip chip-warning' : 'chip chip-success'} role="status">
          {offline ? 'Offline' : 'Online'}
        </span>
      </div>

      <p className={`inset ${styles.count}`}>
        <span className={styles.countValue}>{stats.checked_in}</span> of {stats.confirmed} confirmed
        checked in
      </p>

      {offline ? (
        <p className="banner banner-warning" role="alert" style={{ margin: 0 }}>
          <AlertIcon /> You&apos;re offline. Connect to check people in.
        </p>
      ) : null}

      {!outcome ? (
        <>
          <div className={`inset ${styles.cameraWell}`}>
            <div className={styles.camera}>
              <video
                ref={videoRef}
                className={styles.video}
                muted
                playsInline
                aria-label="Camera view"
              />
              <span className={styles.corners} aria-hidden="true" />
              <span className={styles.hint}>
                {offline ? 'Scanning paused' : busy ? 'Checking…' : 'Point the camera at a ticket'}
              </span>
            </div>
          </div>
          {cameraError ? (
            <p className="banner banner-warning" style={{ margin: 0 }}>
              <AlertIcon /> {cameraError}
            </p>
          ) : null}
          <form className="row" onSubmit={submitTyped}>
            <input
              className="input mono"
              style={{ flex: '1 1 220px' }}
              aria-label="Ticket code"
              placeholder="Or type the ticket code"
              autoComplete="off"
              spellCheck={false}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={offline}
            />
            <button type="submit" className="btn" disabled={offline || busy || !typed.trim()}>
              Check in
            </button>
          </form>
        </>
      ) : (
        <Result outcome={outcome} timezone={timezone} onNext={next} />
      )}

      {canManual ? (
        <ManualCheckIn
          eventId={eventId}
          disabled={offline || busy}
          onSubmit={submit}
          timezone={timezone}
        />
      ) : null}
    </div>
  );
}

function Result({
  outcome,
  timezone,
  onNext,
}: {
  outcome: Outcome;
  timezone: string;
  onNext: () => void;
}) {
  return (
    <section className={`raised ${styles.result}`} aria-live="assertive">
      {outcome.kind === 'ok' ? (
        <>
          <div className="row-between">
            <span className={styles.status} style={{ color: 'var(--success)' }}>
              <span className={styles.statusIcon}>
                <CheckIcon />
              </span>
              Checked in
            </span>
            <span className="mono muted">{formatTime(outcome.result.checked_in_at, timezone)}</span>
          </div>
          <h2 className={styles.name}>{outcome.result.name}</h2>
          <span className="muted">
            {[
              outcome.result.team_name ? `Team ${outcome.result.team_name}` : 'No team yet',
              outcome.result.school,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </>
      ) : outcome.kind === 'already' ? (
        <>
          <span className={styles.status} style={{ color: 'var(--warning)' }}>
            <span className={styles.statusIcon}>
              <AlertIcon />
            </span>
            Already checked in
          </span>
          <h2 className={styles.name}>{outcome.name}</h2>
          <span className="muted">
            First checked in at{' '}
            <span className="mono">
              {outcome.at ? formatTime(outcome.at, timezone) : 'an earlier time'}
            </span>
            . If this isn&apos;t them, ask for ID.
          </span>
        </>
      ) : (
        <>
          <span className={styles.status} style={{ color: 'var(--danger)' }}>
            <span className={styles.statusIcon}>
              <AlertIcon />
            </span>
            Not checked in
          </span>
          <p style={{ margin: 0 }}>{outcome.message}</p>
        </>
      )}
      <button type="button" className="btn btn-primary btn-lg btn-block" onClick={onNext} autoFocus>
        Scan next ticket
      </button>
    </section>
  );
}

function ManualCheckIn({
  eventId,
  disabled,
  timezone,
  onSubmit,
}: {
  eventId: string;
  disabled: boolean;
  timezone: string;
  onSubmit: (
    request: () => Promise<Awaited<ReturnType<typeof api<CheckInResult>>>>,
  ) => Promise<void>;
}) {
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<Attendee[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const result = await api<{ items: Attendee[] }>(
      `/events/${eventId}/check-ins/search?q=${encodeURIComponent(q.trim())}`,
    );
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setPeople(result.data.items);
  }

  async function checkIn(person: Attendee) {
    await onSubmit(() =>
      api<CheckInResult>(`/events/${eventId}/check-ins/manual`, {
        method: 'POST',
        body: { user_id: person.user_id },
      }),
    );
    setPeople(null);
    setQ('');
  }

  return (
    <section className="raised card stack" aria-labelledby="manual-title">
      <div className="stack-sm" style={{ gap: 2 }}>
        <h2 id="manual-title" className="h2">
          Manual check-in
        </h2>
        <span className="muted small">
          No phone or no ticket? Find them by name or email. Recorded in the audit log.
        </span>
      </div>
      <form className="row" onSubmit={search}>
        <input
          className="input"
          style={{ flex: '1 1 220px' }}
          aria-label="Name or email"
          placeholder="Name or email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          disabled={disabled}
        />
        <button type="submit" className="btn" disabled={disabled || q.trim().length < 2}>
          Search
        </button>
      </form>
      {error ? (
        <p className="banner banner-danger" style={{ margin: 0 }}>
          <AlertIcon /> {error}
        </p>
      ) : null}
      {people ? (
        people.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>
            No confirmed attendee matches.
          </p>
        ) : (
          <ul className="stack-sm" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {people.map((person) => (
              <li key={person.user_id} className="row-between">
                <span>
                  <strong>{person.name}</strong>
                  <span className="muted small"> · {person.email}</span>
                </span>
                {person.checked_in_at ? (
                  <span className="chip chip-success">
                    In at {formatTime(person.checked_in_at, timezone)}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={disabled}
                    onClick={() => void checkIn(person)}
                  >
                    Check in
                  </button>
                )}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}
