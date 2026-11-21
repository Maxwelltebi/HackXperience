import { describe, expect, it } from 'vitest';
import { LiveSync } from './live';

function harness() {
  let version = 100;
  const calls = { refetch: 0, polling: [] as boolean[] };
  const sync = new LiveSync({
    refetch: () => {
      calls.refetch += 1;
      return Promise.resolve(version);
    },
    setPolling: (on) => calls.polling.push(on),
  });
  return {
    sync,
    calls,
    setServerVersion: (v: number) => {
      version = v;
    },
  };
}

describe('LiveSync', () => {
  it('fetches once subscribed, and again after a reconnect', async () => {
    const { sync, calls } = harness();
    await sync.onStatus('SUBSCRIBED');
    expect(calls.refetch).toBe(1);
    await sync.onStatus('CHANNEL_ERROR'); // simulated disconnect
    expect(calls.polling).toEqual([true]);
    await sync.onStatus('SUBSCRIBED');
    expect(calls.refetch).toBe(2);
    expect(calls.polling).toEqual([true, false]);
  });

  it('ignores an out-of-order hint older than what is shown', async () => {
    const { sync, calls, setServerVersion } = harness();
    await sync.onStatus('SUBSCRIBED'); // shows version 100
    expect(await sync.onHint({ version: 90 })).toBe(false);
    expect(await sync.onHint({ version: 100 })).toBe(false);
    setServerVersion(120);
    expect(await sync.onHint({ version: 110 })).toBe(true);
    expect(sync.version).toBe(120);
    expect(await sync.onHint({ version: 115 })).toBe(false);
    expect(calls.refetch).toBe(2);
  });

  it('polls only while the channel is down', async () => {
    const { sync, calls } = harness();
    await sync.onPoll();
    expect(calls.refetch).toBe(0);
    await sync.onStatus('TIMED_OUT');
    await sync.onPoll();
    expect(calls.refetch).toBe(1);
    await sync.onStatus('SUBSCRIBED');
    await sync.onPoll();
    expect(calls.refetch).toBe(2); // the resubscribe fetch, not the poll
  });
});
