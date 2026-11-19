import { describe, expect, it } from 'vitest';
import {
  ApiError,
  ERROR_CODES,
  errorBodySchema,
  fieldErrorsOf,
  isValidTimezone,
  listTimezones,
  patchProfileBodySchema,
  registerPushTokenBodySchema,
} from './index';

describe('isValidTimezone', () => {
  it.each(['UTC', 'Africa/Accra', 'Europe/London', 'America/Argentina/Buenos_Aires'])(
    'accepts %s',
    (zone) => {
      expect(isValidTimezone(zone)).toBe(true);
    },
  );

  it.each(['', 'utc', 'Mars/Olympus_Mons', 'Africa/Atlantis', 'GMT+5', '../etc/passwd', 'Africa/'])(
    'rejects %j',
    (zone) => {
      expect(isValidTimezone(zone)).toBe(false);
    },
  );

  it('lists UTC and Africa/Accra for pickers', () => {
    const zones = listTimezones();
    expect(zones).toContain('UTC');
    expect(zones).toContain('Africa/Accra');
  });
});

describe('patchProfileBodySchema', () => {
  it('accepts a partial update and turns empty text into null', () => {
    const parsed = patchProfileBodySchema.parse({ school: '  ', timezone: 'Africa/Accra' });
    expect(parsed).toEqual({ school: null, timezone: 'Africa/Accra' });
  });

  it('rejects an unknown time zone with a field path', () => {
    const result = patchProfileBodySchema.safeParse({ timezone: 'Mars/Olympus_Mons' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['timezone']);
  });

  it('rejects unknown fields', () => {
    expect(patchProfileBodySchema.safeParse({ is_platform_admin: true }).success).toBe(false);
  });

  it('rejects a GitHub link where a username belongs', () => {
    const result = patchProfileBodySchema.safeParse({ github_username: 'https://github.com/x' });
    expect(result.success).toBe(false);
  });

  it('accepts a GitHub username and clears with ""', () => {
    expect(patchProfileBodySchema.parse({ github_username: 'ama-mensah' })).toEqual({
      github_username: 'ama-mensah',
    });
    expect(patchProfileBodySchema.parse({ github_username: '' })).toEqual({
      github_username: null,
    });
  });

  it('requires https for the avatar', () => {
    expect(patchProfileBodySchema.safeParse({ avatar_url: 'http://x.test/a.png' }).success).toBe(
      false,
    );
  });
});

describe('registerPushTokenBodySchema', () => {
  it('rejects unknown platforms', () => {
    expect(
      registerPushTokenBodySchema.safeParse({ token: 'x', platform: 'blackberry' }).success,
    ).toBe(false);
  });
});

describe('ApiError', () => {
  it('maps codes to statuses and produces the standard body', () => {
    const error = ApiError.validation('Bad body', { timezone: 'x' });
    expect(error.status).toBe(400);
    expect(errorBodySchema.parse(error.toBody())).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Bad body',
        details: { fields: { timezone: 'x' } },
      },
    });
    expect(error.fieldErrors).toEqual({ timezone: 'x' });
    expect(new ApiError('UNAUTHENTICATED', 'Sign in').status).toBe(401);
  });

  it('reads field errors defensively', () => {
    expect(fieldErrorsOf(undefined)).toEqual({});
    expect(fieldErrorsOf({ fields: 'nope' })).toEqual({});
    expect(fieldErrorsOf({ first_checked_in_at: '2026-12-06T08:42:00Z' })).toEqual({});
  });

  it('has a status for every code', () => {
    for (const code of ERROR_CODES) {
      expect(new ApiError(code, '').status).toBeGreaterThanOrEqual(400);
    }
  });
});
