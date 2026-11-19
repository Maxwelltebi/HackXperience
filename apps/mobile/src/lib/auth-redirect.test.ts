import { describe, expect, it } from 'vitest';
import { parseAuthRedirect } from './auth-redirect';

describe('parseAuthRedirect', () => {
  it('reads the PKCE code from the app scheme', () => {
    expect(parseAuthRedirect('hackxperience://auth/callback?code=abc123')).toEqual({
      kind: 'code',
      code: 'abc123',
    });
  });

  it('reads the code from an Expo Go URL', () => {
    expect(parseAuthRedirect('exp://192.168.1.5:8081/--/auth/callback?code=xyz')).toEqual({
      kind: 'code',
      code: 'xyz',
    });
  });

  it('reports an OAuth error from the query or the fragment', () => {
    expect(
      parseAuthRedirect(
        'hackxperience://auth/callback?error=access_denied&error_description=User+cancelled',
      ),
    ).toEqual({ kind: 'error', message: 'User cancelled' });
    expect(parseAuthRedirect('hackxperience://auth/callback#error=server_error')).toEqual({
      kind: 'error',
      message: 'server_error',
    });
  });

  it('returns none when there is nothing to read', () => {
    expect(parseAuthRedirect('hackxperience://auth/callback')).toEqual({ kind: 'none' });
  });
});
