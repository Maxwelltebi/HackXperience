// Integration tests run the real route handlers against the real local database.
// Only token verification is replaced: Supabase Auth is not part of the test, so a
// request is "signed in as X" when it carries `Authorization: Bearer test:<user id>`.
// The real authenticate() is covered by tests/auth.test.ts.
import { vi } from 'vitest';
import type * as AuthModule from '@/lib/api/auth';

vi.mock('@/lib/api/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof AuthModule>();
  return {
    ...actual,
    authenticate: async (request: Request) => {
      const token = actual.bearerToken(request);
      return token?.startsWith('test:') ? token.slice('test:'.length) : null;
    },
  };
});
