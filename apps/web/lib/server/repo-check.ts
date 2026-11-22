import 'server-only';
import { ApiError, githubRepoOf } from '@hx/shared';
import { repoVisibility } from './github';

/** The message under the GitHub field when a repository isn't public (R37). */
export const PRIVATE_REPO_MESSAGE =
  "This repository is private or doesn't exist. Make it public on GitHub, or remove the link.";

/**
 * Refuses a GitHub link whose repository isn't public (R37): judges must be able to open it.
 * Call it before the transaction (Agent rule 9). An unknown answer (GitHub down or rate-limited)
 * lets the request through; the deadline's commit check flags repositories it can't read.
 */
export async function assertPublicRepo(githubUrl: string | null | undefined): Promise<void> {
  if (!githubUrl?.trim()) return;
  const repo = githubRepoOf(githubUrl);
  if (!repo) return; // a malformed link is reported by the save's own link check
  if ((await repoVisibility(repo)) === 'private') {
    throw ApiError.validation('Make your GitHub repository public first.', {
      github_url: PRIVATE_REPO_MESSAGE,
    });
  }
}

/** Whether two GitHub links name different repositories, ignoring case and the form of the URL. */
export function differentRepo(a: string | null | undefined, b: string | null | undefined): boolean {
  const key = (raw: string | null | undefined) => {
    const repo = raw ? githubRepoOf(raw) : null;
    return repo ? `${repo.owner}/${repo.repo}`.toLowerCase() : '';
  };
  return key(a) !== key(b);
}
