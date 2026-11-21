'use client';

import { LIVE_EVENT, LIVE_POLL_MS, LiveSync, type ChannelStatus, type LiveHint } from '@hx/shared';
import { useEffect, useRef } from 'react';
import { browserSupabase } from '@/lib/supabase/browser';

/**
 * Keeps a view in step with a private realtime channel (build plan Phase 6 item 8): subscribe
 * first, then fetch; refetch on every reconnect; ignore hints no newer than what's shown; poll
 * every 30 seconds while the channel is down (or when realtime isn't available at all).
 * `refetch` loads fresh data and returns the version it was read at. `onHint` sees every hint
 * first (for hints that carry data, like staff counts) and may return true to skip the refetch.
 */
export function useLiveChannel(
  topic: string | null,
  refetch: () => Promise<number | null>,
  onHint?: (hint: LiveHint) => boolean,
): void {
  const refetchRef = useRef(refetch);
  const hintRef = useRef(onHint);
  refetchRef.current = refetch;
  hintRef.current = onHint;

  useEffect(() => {
    if (!topic) return;
    let timer: number | undefined;
    const sync = new LiveSync({
      refetch: () => refetchRef.current(),
      setPolling: (on) => {
        window.clearInterval(timer);
        timer = on ? window.setInterval(() => void sync.onPoll(), LIVE_POLL_MS) : undefined;
      },
    });

    const supabase = browserSupabase();
    if (!supabase) {
      void sync.onStatus('CHANNEL_ERROR');
      return () => window.clearInterval(timer);
    }
    let cancelled = false;
    const channel = supabase.channel(topic, { config: { private: true } });
    channel.on('broadcast', { event: LIVE_EVENT }, ({ payload }) => {
      const hint = payload as LiveHint;
      if (typeof hint?.version !== 'number') return;
      if (hintRef.current?.(hint)) {
        sync.seen(hint.version);
        return;
      }
      void sync.onHint(hint);
    });
    void (async () => {
      // Private channels authorize with the signed-in user's token.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      await supabase.realtime.setAuth(data.session?.access_token ?? null);
      channel.subscribe((status) => void sync.onStatus(status as ChannelStatus));
    })();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [topic]);
}
