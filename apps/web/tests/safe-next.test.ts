import { describe, expect, it } from 'vitest';
import { safeNext } from '@/lib/safe-next';

describe('safeNext', () => {
  it.each(['/profile', '/events/abc?tab=team', '/'])('keeps same-site path %s', (path) => {
    expect(safeNext(path)).toBe(path);
  });

  it.each([
    null,
    '',
    'https://evil.test',
    '//evil.test',
    '/\\evil.test',
    'javascript:alert(1)',
    '/ok\r\nSet-Cookie: x',
  ])('falls back for %j', (value) => {
    expect(safeNext(value)).toBe('/profile');
  });
});
