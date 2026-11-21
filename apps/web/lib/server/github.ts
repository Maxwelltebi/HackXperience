import 'server-only';
import type { CommitFetcher } from '@hx/db';

/** Answers that mean the repository can't be read: missing or private (404), empty (409), blocked (451). */
const UNREACHABLE_STATUSES = new Set([404, 409, 451]);

/**
 * Fetches the latest commit on a repository's default branch from the GitHub API
 * (`GET /repos/{owner}/{repo}/commits?per_page=1`, which uses the default branch).
 * A missing, private or empty repository is `unreachable`; rate limits, bad tokens, server
 * errors and network failures throw, so the hash stays pending and the next tick retries.
 * GITHUB_TOKEN is server-only (Agent rule 17); without it GitHub allows 60 requests an hour.
 */
export function createCommitFetcher(
  token: string | undefined,
  fetchImpl: typeof fetch = fetch,
): CommitFetcher {
  return async ({ owner, repo }) => {
    const headers: Record<string, string> = {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'HackXperience',
    };
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetchImpl(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?per_page=1`,
      { headers, signal: AbortSignal.timeout(10_000), cache: 'no-store' },
    );
    if (UNREACHABLE_STATUSES.has(response.status)) return { kind: 'unreachable' };
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
    const commits = (await response.json()) as unknown;
    const sha = Array.isArray(commits) ? (commits[0] as { sha?: unknown } | undefined)?.sha : null;
    if (typeof sha !== 'string' || !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(sha))
      return { kind: 'unreachable' };
    return { kind: 'captured', sha };
  };
}

export function commitFetcher(): CommitFetcher {
  return createCommitFetcher(process.env.GITHUB_TOKEN || undefined);
}
