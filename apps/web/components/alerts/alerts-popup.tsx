'use client';

import type { AlertSignupResult, EventSummary } from '@hx/shared';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { api, serverOffsetMs } from '@/lib/client/api';
import { eventPhase } from '@/lib/ui/event-phase';
import { chipClass } from '@/lib/ui/status';
import { remainingParts } from '../countdown';
import { AlertIcon, CloseIcon } from '../icons';
import { Busy } from '../loading-state';
import { PixelBoard, type BoardMode } from './pixel-board';

/** Buttons anywhere on the page open the pop-up with this window event. */
export const OPEN_ALERTS_EVENT = 'hx:open-alerts';

const STORAGE_KEY = 'hx.alerts';
const SHOW_AFTER_MS = 6000;
const DISMISSED_FOR_MS = 30 * 24 * 3_600_000;
/** Pages where it never opens by itself. */
const QUIET_PATHS = ['/alerts', '/sign-in', '/organize', '/profile'];

const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());

type Stored = { subscribed?: boolean; dismissedAt?: number };

function readStored(): Stored {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Stored;
  } catch {
    return {};
  }
}

function writeStored(value: Stored): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Private windows and blocked storage: it just shows again next visit.
  }
}

/** Whether it may open by itself: not after a sign-up, and not within 30 days of closing it. */
function mayOpenByItself(): boolean {
  const stored = readStored();
  if (stored.subscribed) return false;
  return !stored.dismissedAt || Date.now() - stored.dismissedAt > DISMISSED_FOR_MS;
}

/**
 * The event alerts pop-up (R42). Slides in at the bottom corner (a bottom sheet on phones) after
 * 6 seconds or half a page of scrolling, whichever comes first. Shows the next event's countdown,
 * or "Coming soon" when nothing is published. Closed: stays away for 30 days. Signed up: never
 * opens by itself again. Any OpenAlertsButton opens it on demand.
 */
export function AlertsPopup() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState<EventSummary | null | undefined>(undefined);
  const [email, setEmail] = useState('');
  const [trap, setTrap] = useState('');
  const [state, setState] = useState<'form' | 'sending' | 'done'>('form');
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const inputId = useId();

  // Opens it, and looks up the next event the first time.
  const show = useRef((focus: boolean) => {
    setOpen(true);
    if (focus) window.setTimeout(() => input.current?.focus(), 50);
  });
  useEffect(() => {
    if (!open || next !== undefined) return;
    let cancelled = false;
    void api<{ items: EventSummary[] }>('/events').then((result) => {
      if (cancelled) return;
      const now = Date.now() + serverOffsetMs();
      const upcoming = result.ok
        ? result.data.items.find((e) => Date.parse(e.ends_at) >= now)
        : undefined;
      setNext(upcoming ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [open, next]);

  // On demand, from any page.
  useEffect(() => {
    const onOpen = () => show.current(true);
    window.addEventListener(OPEN_ALERTS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ALERTS_EVENT, onOpen);
  }, []);

  // By itself: after 6 seconds or half a page of scrolling.
  useEffect(() => {
    if (QUIET_PATHS.some((p) => pathname.startsWith(p)) || !mayOpenByItself()) return;
    let done = false;
    const trigger = () => {
      if (done) return;
      done = true;
      cleanup();
      if (mayOpenByItself()) show.current(false);
    };
    const onScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollable > 0 && window.scrollY / scrollable >= 0.5) trigger();
    };
    const timer = window.setTimeout(trigger, SHOW_AFTER_MS);
    window.addEventListener('scroll', onScroll, { passive: true });
    function cleanup() {
      window.clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
    }
    return cleanup;
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  function close() {
    setOpen(false);
    if (state !== 'done') writeStored({ ...readStored(), dismissedAt: Date.now() });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!looksLikeEmail(email)) {
      setError('Enter an email address, like you@example.com.');
      setShake((n) => n + 1);
      input.current?.focus();
      return;
    }
    setError(null);
    setState('sending');
    const result = await api<AlertSignupResult>('/alerts', {
      method: 'POST',
      body: { email: email.trim(), ...(trap ? { website: trap } : {}) },
    });
    if (!result.ok) {
      setState('form');
      setError(result.fields.email ?? result.message);
      setShake((n) => n + 1);
      return;
    }
    writeStored({ subscribed: true });
    setState('done');
  }

  if (!open) return null;

  const valid = looksLikeEmail(email);
  const mode: BoardMode =
    state === 'done'
      ? 'done'
      : state === 'sending'
        ? 'sending'
        : valid
          ? 'ready'
          : email.length > 0
            ? 'typing'
            : 'idle';

  return (
    <aside
      className="alerts-pop frame"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-shake={shake % 2 === 1 ? 'a' : shake > 0 ? 'b' : undefined}
    >
      <div className="alerts-pop-top band-dark">
        <div className="row-between">
          <NextStatus next={next} />
          <button type="button" className="alerts-pop-close" aria-label="Close" onClick={close}>
            <CloseIcon />
          </button>
        </div>
        <PixelBoard mode={mode} progress={Math.min(1, email.length / 24)} />
        <NextEvent next={next} />
      </div>

      {state === 'done' ? (
        <div className="alerts-pop-body" aria-live="polite">
          <h2 id={titleId} className="h3">
            You&apos;re on the list
          </h2>
          <p className="muted small" style={{ margin: 0 }}>
            We&apos;ll email <strong className="alerts-pop-email">{email.trim()}</strong> when a
            CIReN hackathon is published, when applications open, and two days before they close.
          </p>
          <div>
            <button type="button" className="btn btn-sm" onClick={close}>
              Close
            </button>
          </div>
        </div>
      ) : (
        <form className="alerts-pop-body" onSubmit={submit} noValidate>
          <h2 id={titleId} className="h3">
            Get event alerts
          </h2>
          <p className="muted small" style={{ margin: 0 }}>
            We&apos;ll email you when a CIReN hackathon is published, when applications open, and
            two days before they close.
          </p>
          <div className="field">
            <label className="label" htmlFor={inputId}>
              Email
            </label>
            <div className="alerts-pop-field">
              <input
                ref={input}
                id={inputId}
                className="input"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${inputId}-error` : undefined}
                disabled={state === 'sending'}
              />
              <button type="submit" className="btn btn-primary" disabled={state === 'sending'}>
                {state === 'sending' ? <Busy>Saving…</Busy> : 'Notify me'}
              </button>
            </div>
            {/* People never see this field; bots fill it in. */}
            <input
              className="visually-hidden"
              tabIndex={-1}
              aria-hidden="true"
              autoComplete="off"
              name="website"
              value={trap}
              onChange={(e) => setTrap(e.target.value)}
            />
            {error ? (
              <span id={`${inputId}-error`} className="field-error" role="alert">
                <AlertIcon width={16} height={16} /> {error}
              </span>
            ) : null}
          </div>
          <p className="hint" style={{ margin: 0 }}>
            Only event alerts. Every email has an unsubscribe link.
          </p>
        </form>
      )}
    </aside>
  );
}

/** The server's clock, ticking every second. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now() + serverOffsetMs());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now() + serverOffsetMs()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/** The status word above the display: the next event's phase, or "Coming soon". */
function NextStatus({ next }: { next: EventSummary | null | undefined }) {
  const now = useNow();
  if (next === undefined) return <span className="eyebrow">Event alerts</span>;
  if (next === null) return <span className="eyebrow">Next event: coming soon</span>;
  const phase = eventPhase(next, new Date(now));
  return <span className={chipClass(phase.tone)}>{phase.label}</span>;
}

/** What the countdown counts to: the next moment that matters for the event. */
function countdownTarget(event: EventSummary, now: number): { label: string; at: string } | null {
  const open = event.applications_open_at;
  const close = event.applications_close_at;
  if (open && now < Date.parse(open)) return { label: 'Applications open in', at: open };
  if (close && now < Date.parse(close)) return { label: 'Applications close in', at: close };
  if (now < Date.parse(event.starts_at)) return { label: 'Hacking starts in', at: event.starts_at };
  return null;
}

/** The next event's name and a live countdown, or the "coming soon" line. */
function NextEvent({ next }: { next: EventSummary | null | undefined }) {
  const now = useNow();
  if (next === undefined) return null;
  if (next === null) {
    return (
      <p className="muted small" style={{ margin: 0 }}>
        No event is published yet. Leave your email and you&apos;ll hear first.
      </p>
    );
  }
  const target = countdownTarget(next, now);
  return (
    <div className="stack-sm">
      <p className="alerts-pop-event">{next.name}</p>
      {target ? (
        <div className="stack-sm">
          <span className="muted small">{target.label}</span>
          <time className="countdown-blocks alerts-pop-count" dateTime={target.at}>
            {remainingParts(Date.parse(target.at) - now).map((part) => (
              <span key={part.unit}>
                <b className="mono">{part.value}</b>
                <small>{part.unit}</small>
              </span>
            ))}
          </time>
        </div>
      ) : (
        <span className="muted small">Happening now.</span>
      )}
    </div>
  );
}
