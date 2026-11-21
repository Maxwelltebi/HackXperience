import { describe, expect, it, vi } from 'vitest';
import { checkAuthAvailability, LOCAL_PLACEHOLDER_KEY } from '@/lib/supabase/availability';

describe('checkAuthAvailability', () => {
  it('reports a fresh local setup as not configured, without any request', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    expect(
      await checkAuthAvailability('http://127.0.0.1:54321', LOCAL_PLACEHOLDER_KEY, fetchImpl),
    ).toBe('not_configured');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('counts any HTTP answer as reachable', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('no', { status: 401 }));
    expect(await checkAuthAvailability('https://x.supabase.co/', 'key', fetchImpl)).toBe('ok');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://x.supabase.co/auth/v1/health',
      expect.anything(),
    );
  });

  it('reports a refused connection as unreachable', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'));
    expect(await checkAuthAvailability('http://127.0.0.1:54321', 'key', fetchImpl)).toBe(
      'unreachable',
    );
  });

  it('really fails fast against a closed local port', async () => {
    expect(await checkAuthAvailability('http://127.0.0.1:9', 'key')).toBe('unreachable');
  });
});
