import { describe, expect, it } from 'vitest';
import { createCommitFetcher } from '@/lib/server/github';

const SHA = '0123456789abcdef0123456789abcdef01234567';

function fakeFetch(status: number, body: unknown = []) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const impl = (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string> });
    return Promise.resolve(Response.json(body, { status }));
  };
  return { calls, impl: impl as typeof fetch };
}

describe('createCommitFetcher', () => {
  it('captures the latest commit on the default branch, with the token', async () => {
    const fake = fakeFetch(200, [{ sha: SHA }]);
    const result = await createCommitFetcher(
      'ghp_test',
      fake.impl,
    )({ owner: 'ciren', repo: 'clinicq' });
    expect(result).toEqual({ kind: 'captured', sha: SHA });
    expect(fake.calls[0]?.url).toBe(
      'https://api.github.com/repos/ciren/clinicq/commits?per_page=1',
    );
    expect(fake.calls[0]?.headers.authorization).toBe('Bearer ghp_test');
  });

  it.each([404, 409, 451])('treats %i as unreachable', async (status) => {
    const fake = fakeFetch(status, { message: 'Not Found' });
    expect(await createCommitFetcher(undefined, fake.impl)({ owner: 'a', repo: 'b' })).toEqual({
      kind: 'unreachable',
    });
    expect(fake.calls[0]?.headers.authorization).toBeUndefined();
  });

  it('treats an empty commit list as unreachable', async () => {
    const fake = fakeFetch(200, []);
    expect(await createCommitFetcher(undefined, fake.impl)({ owner: 'a', repo: 'b' })).toEqual({
      kind: 'unreachable',
    });
  });

  it.each([401, 403, 429, 500, 502])('throws on %i so the next tick retries', async (status) => {
    const fake = fakeFetch(status, { message: 'nope' });
    await expect(createCommitFetcher('t', fake.impl)({ owner: 'a', repo: 'b' })).rejects.toThrow(
      String(status),
    );
  });
});
