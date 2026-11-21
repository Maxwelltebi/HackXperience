// Submission link checks (build plan Phase 4 item 3). Shared so web and mobile forms agree
// with the API. Each parser returns the link in one canonical form, or an error message.
// No `URL` class: React Native's is incomplete, so links are parsed with one pattern.

export type LinkResult = { ok: true; url: string } | { ok: false; message: string };

/** Longest link we store. */
export const MAX_LINK_LENGTH = 500;

interface ParsedLink {
  scheme: 'http' | 'https';
  host: string;
  port: string | undefined;
  /** Path, query and fragment, e.g. "/watch?v=abc". Empty or starting with "/", "?" or "#". */
  rest: string;
  path: string;
}

// scheme://host[:port][/path][?query][#fragment]; no user:password@, no spaces.
const LINK = /^(https?):\/\/([a-z0-9.-]+)(?::(\d{1,5}))?([/?#][^\s]*)?$/i;

const GITHUB_OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const GITHUB_REPO = /^[A-Za-z0-9._-]{1,100}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);

/** Parse a link the way people paste it: the https:// may be missing. */
function parseLink(raw: string): ParsedLink | null {
  const text = raw.trim();
  if (text === '' || text.length > MAX_LINK_LENGTH) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  const match = LINK.exec(withScheme);
  if (!match?.[1] || !match[2]) return null;
  const host = match[2].toLowerCase();
  if (host.startsWith('.') || host.endsWith('.') || host.includes('..')) return null;
  const rest = match[4] ?? '';
  return {
    scheme: match[1].toLowerCase() as 'http' | 'https',
    host,
    port: match[3],
    rest,
    path: rest.split(/[?#]/)[0] ?? '',
  };
}

/** The owner and repository named by a GitHub link, or null. */
export function githubRepoOf(raw: string): { owner: string; repo: string } | null {
  const link = parseLink(raw);
  if (!link || link.port || (link.host !== 'github.com' && link.host !== 'www.github.com')) {
    return null;
  }
  // Deeper paths (/tree/main, /blob/...) still name the repository; we keep only owner/repo.
  const [owner, rawRepo] = link.path.split('/').filter(Boolean);
  const repo = rawRepo?.replace(/\.git$/i, '');
  if (!owner || !repo || !GITHUB_OWNER.test(owner) || !GITHUB_REPO.test(repo)) return null;
  if (repo === '.' || repo === '..') return null;
  return { owner, repo };
}

/** GitHub links must name a repository: https://github.com/{owner}/{repo}. */
export function parseGithubLink(raw: string): LinkResult {
  const repo = githubRepoOf(raw);
  if (!repo) {
    return { ok: false, message: 'Link to the repository, like https://github.com/owner/repo' };
  }
  return { ok: true, url: `https://github.com/${repo.owner}/${repo.repo}` };
}

/** YouTube links must be on youtube.com or youtu.be. Stored with https. */
export function parseYoutubeLink(raw: string): LinkResult {
  const link = parseLink(raw);
  if (!link || link.port || !YOUTUBE_HOSTS.has(link.host) || link.path.replace(/\/+$/, '') === '') {
    return { ok: false, message: 'Use a YouTube link, like https://youtu.be/…' };
  }
  return { ok: true, url: `https://${link.host}${link.rest}` };
}

/** Demo links can be any site, but must use https. */
export function parseDemoLink(raw: string): LinkResult {
  const text = raw.trim();
  const link = /^https:\/\//i.test(text) ? parseLink(text) : null;
  if (!link || !link.host.includes('.')) {
    return { ok: false, message: 'Enter the full link, starting with https://' };
  }
  return { ok: true, url: `https://${link.host}${link.port ? `:${link.port}` : ''}${link.rest}` };
}
