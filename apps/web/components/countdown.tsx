'use client';

import { useEffect, useState } from 'react';
import { serverOffsetMs, syncServerTime } from '@/lib/client/api';

interface Props {
  /** The moment the countdown reaches zero (UTC ISO 8601). */
  deadline: string;
  /** The server's clock when the page was rendered, so a wrong device clock doesn't matter. */
  serverNow: string;
  /** Called once when the countdown reaches zero. */
  onExpire?: () => void;
}

/** "2d 4h", "3h 07m", "12m 05s": coarse when far, to the second in the last hour. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${pad(minutes)}m`;
  return `${minutes}m ${pad(seconds)}s`;
}

/**
 * Time left until `deadline`, using the server's clock (build plan Phase 4 item 9): the offset
 * comes from the page render and from every API response's server_time header.
 */
export function Countdown({ deadline, serverNow, onExpire }: Props) {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    syncServerTime(serverNow);
  }, [serverNow]);

  useEffect(() => {
    const end = Date.parse(deadline);
    let expired = false;
    const update = () => {
      const remaining = end - (Date.now() + serverOffsetMs());
      setLeft(remaining);
      if (remaining <= 0 && !expired) {
        expired = true;
        onExpire?.();
      }
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [deadline, onExpire]);

  // Rendered on the server too: show nothing until the browser knows the time.
  if (left === null) return <span className="mono">…</span>;
  return (
    <time className="mono" dateTime={deadline} aria-live="off">
      {left > 0 ? formatRemaining(left) : '0m 00s'}
    </time>
  );
}
