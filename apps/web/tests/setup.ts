// Integration tests run the real route handlers against the real local database.
// Only token verification is replaced: Supabase Auth is not part of the test, so a
// request is "signed in as X" when it carries `Authorization: Bearer test:<user id>`.
// The real authenticate() is covered by tests/auth.test.ts.
import { vi } from 'vitest';
import type * as AuthModule from '@/lib/api/auth';
import type * as GithubModule from '@/lib/server/github';

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

// GitHub is not part of the tests (R37): a repository whose name starts with "private" is
// private, one starting with "unknown" can't be checked, and anything else is public.
vi.mock('@/lib/server/github', async (importOriginal) => {
  const actual = await importOriginal<typeof GithubModule>();
  return {
    ...actual,
    repoVisibility: ({ repo }: { owner: string; repo: string }) =>
      Promise.resolve(
        repo.startsWith('private') ? 'private' : repo.startsWith('unknown') ? 'unknown' : 'public',
      ),
  };
});
