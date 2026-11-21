// The reconnect rules for live channels (build plan Phase 6 item 8, DESIGN Step 6 part 4),
// kept free of React and of the Supabase client so web and mobile share them and tests can
// drive them directly.

/** Channel states as the Supabase client reports them. */
export type ChannelStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR';

/** Poll this often while the subscription is down. */
export const LIVE_POLL_MS = 30_000;

export interface LiveSyncOptions {
  /** Fetch fresh data; resolves to the version the data was read at. */
  refetch: () => Promise<number | null>;
  /** Start or stop the 30-second polling fallback. */
  setPolling: (on: boolean) => void;
}

/**
 * Subscribe first, then fetch; refetch on every (re)subscribe; ignore hints no newer than the
 * data on screen; poll while the channel is down.
 */
export class LiveSync {
  private shown = Number.NEGATIVE_INFINITY;
  private polling = false;

  constructor(private readonly options: LiveSyncOptions) {}

  /** The version of the data on screen. */
  get version(): number {
    return this.shown;
  }

  /** A channel status change from the realtime client. */
  async onStatus(status: ChannelStatus): Promise<void> {
    if (status === 'SUBSCRIBED') {
      this.setPolling(false);
      await this.refresh();
    } else {
      this.setPolling(true);
    }
  }

  /** A broadcast hint. Returns true when it caused a refetch. */
  async onHint(hint: { version: number }): Promise<boolean> {
    if (!(hint.version > this.shown)) return false;
    await this.refresh();
    return true;
  }

  /** The polling timer fired. */
  async onPoll(): Promise<void> {
    if (this.polling) await this.refresh();
  }

  /** Record data fetched some other way (e.g. after the user's own save). */
  seen(version: number): void {
    if (version > this.shown) this.shown = version;
  }

  private async refresh(): Promise<void> {
    const version = await this.options.refetch();
    if (version !== null) this.seen(version);
  }

  private setPolling(on: boolean): void {
    if (this.polling === on) return;
    this.polling = on;
    this.options.setPolling(on);
  }
}
