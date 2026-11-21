import { describe, expect, it } from 'vitest';
import { githubRepoOf, parseDemoLink, parseGithubLink, parseYoutubeLink } from './links';
import { saveSubmissionBodySchema } from './schemas/submissions';

const ok = (url: string) => ({ ok: true, url });

describe('parseGithubLink', () => {
  it.each([
    ['https://github.com/ciren/clinicq', 'https://github.com/ciren/clinicq'],
    ['github.com/ciren/clinicq', 'https://github.com/ciren/clinicq'],
    ['http://www.github.com/ciren/clinicq/', 'https://github.com/ciren/clinicq'],
    ['https://github.com/ciren/clinicq.git', 'https://github.com/ciren/clinicq'],
    ['https://github.com/ciren/clinicq/tree/main/src', 'https://github.com/ciren/clinicq'],
    ['https://GitHub.com/Ama-M/my.app_v2', 'https://github.com/Ama-M/my.app_v2'],
    ['  https://github.com/a/b?tab=readme  ', 'https://github.com/a/b'],
  ])('accepts %s', (input, url) => {
    expect(parseGithubLink(input)).toEqual(ok(url));
  });

  it.each([
    'https://github.com/ciren',
    'https://github.com/',
    'https://gitlab.com/ciren/clinicq',
    'https://github.com.evil.example/ciren/clinicq',
    'https://user:pass@github.com/ciren/clinicq',
    'https://github.com:8443/ciren/clinicq',
    'ftp://github.com/ciren/clinicq',
    'https://github.com/-bad/repo',
    'https://github.com/ciren/..',
    'not a link',
    '',
  ])('refuses %s', (input) => {
    expect(parseGithubLink(input).ok).toBe(false);
  });

  it('names the owner and repository for the hash fetch', () => {
    expect(githubRepoOf('https://github.com/ciren/clinicq.git')).toEqual({
      owner: 'ciren',
      repo: 'clinicq',
    });
  });
});

describe('parseYoutubeLink', () => {
  it.each([
    ['https://youtu.be/dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ'],
    ['youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com/watch?v=dQw4w9WgXcQ'],
    ['http://www.youtube.com/watch?v=abc&t=10', 'https://www.youtube.com/watch?v=abc&t=10'],
    ['https://m.youtube.com/shorts/abc', 'https://m.youtube.com/shorts/abc'],
  ])('accepts %s', (input, url) => {
    expect(parseYoutubeLink(input)).toEqual(ok(url));
  });

  it.each([
    'https://vimeo.com/123',
    'https://youtube.com.evil.example/watch?v=x',
    'https://youtube.com/',
    'https://notyoutube.com/watch?v=x',
  ])('refuses %s', (input) => {
    expect(parseYoutubeLink(input).ok).toBe(false);
  });
});

describe('parseDemoLink', () => {
  it('accepts https links', () => {
    expect(parseDemoLink('https://clinicq.vercel.app/demo?x=1')).toEqual(
      ok('https://clinicq.vercel.app/demo?x=1'),
    );
  });

  it.each([
    'http://clinicq.vercel.app',
    'clinicq.vercel.app',
    'javascript:alert(1)',
    'https://localhost:3000',
    'https://a b.com',
  ])('refuses %s', (input) => {
    expect(parseDemoLink(input).ok).toBe(false);
  });
});

describe('saveSubmissionBodySchema', () => {
  it('turns empty links into null and stores links in canonical form', () => {
    const body = saveSubmissionBodySchema.parse({
      title: '  ClinicQ ',
      github_url: 'github.com/ciren/clinicq/',
      youtube_url: '',
      demo_url: null,
    });
    expect(body).toMatchObject({
      title: 'ClinicQ',
      github_url: 'https://github.com/ciren/clinicq',
      youtube_url: null,
      demo_url: null,
      track_ids: [],
    });
  });

  it('reports a bad link on its field', () => {
    const result = saveSubmissionBodySchema.safeParse({ demo_url: 'http://insecure.example' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['demo_url']);
  });

  it('refuses unknown fields such as status', () => {
    expect(saveSubmissionBodySchema.safeParse({ status: 'submitted' }).success).toBe(false);
  });
});
