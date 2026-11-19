// The real authenticate(), without the test stand-in from setup.ts.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as AuthModule from '@/lib/api/auth';

const { authenticate, bearerToken } = await vi.importActual<typeof AuthModule>('@/lib/api/auth');

function base64url(value: object | string): string {
  return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString(
    'base64url',
  );
}

function request(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/v1/me', { headers });
}

beforeAll(() => {
  // Nothing listens here: any attempt to ask Supabase Auth fails fast.
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:9');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('bearerToken', () => {
  it('reads a bearer token and ignores other schemes', () => {
    expect(bearerToken(request({ authorization: 'Bearer abc.def.ghi' }))).toBe('abc.def.ghi');
    expect(bearerToken(request({ authorization: 'Basic abc' }))).toBeNull();
    expect(bearerToken(request())).toBeNull();
  });
});

describe('authenticate', () => {
  it('returns null with no token and no session cookie', async () => {
    expect(await authenticate(request())).toBeNull();
  });

  it('returns null for a malformed token', async () => {
    expect(await authenticate(request({ authorization: 'Bearer not-a-jwt' }))).toBeNull();
  });

  it('returns null for a forged token with a bad signature', async () => {
    const forged = [
      base64url({ alg: 'HS256', typ: 'JWT' }),
      base64url({
        sub: crypto.randomUUID(),
        role: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
      base64url('not-a-signature'),
    ].join('.');
    expect(await authenticate(request({ authorization: `Bearer ${forged}` }))).toBeNull();
  });
});
