// Phase 1 endpoints against the local database.
import { meResponseSchema, publicProfileSchema, pushTokenSchema } from '@hx/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET as notFoundGet, POST as notFoundPost } from '@/app/api/v1/[...path]/route';
import { GET as health } from '@/app/api/v1/health/route';
import { PATCH as patchProfile } from '@/app/api/v1/me/profile/route';
import {
  DELETE as deletePushToken,
  POST as postPushToken,
} from '@/app/api/v1/me/push-tokens/route';
import { GET as getMe } from '@/app/api/v1/me/route';
import { GET as getPublicProfile } from '@/app/api/v1/users/[id]/profile/route';
import { call, expectError, expectServerTime, testUsers } from './helpers';

const users = testUsers();
let ama: { id: string; email: string };
let efua: { id: string; email: string };

beforeAll(async () => {
  ama = await users.create('Ama Mensah');
  efua = await users.create('Efua Owusu');
});

afterAll(() => users.cleanup());

describe('GET /health', () => {
  it('runs select 1 and returns ok without auth', async () => {
    const response = await call(health);
    expect(response.status).toBe(200);
    expectServerTime(response);
    expect(await response.json()).toEqual({ status: 'ok', database: 'ok' });
  });
});

describe('GET /me', () => {
  it('refuses an unauthenticated call with 401 in the standard shape', async () => {
    const body = await expectError(await call(getMe), 401, 'UNAUTHENTICATED');
    expect(body.error.message).toBeTruthy();
  });

  it('returns the signed-in user and profile', async () => {
    const response = await call(getMe, { as: ama.id });
    expect(response.status).toBe(200);
    expectServerTime(response);
    const me = meResponseSchema.parse(await response.json());
    expect(me.user).toMatchObject({ id: ama.id, email: ama.email, name: 'Ama Mensah' });
    expect(me.profile).toMatchObject({ timezone: 'UTC', email_reminders: true });
  });

  it('returns 404 for a verified token whose user no longer exists', async () => {
    await expectError(await call(getMe, { as: crypto.randomUUID() }), 404, 'NOT_FOUND');
  });
});

describe('PATCH /me/profile', () => {
  const patch = (as: string | undefined, body: unknown) =>
    call(patchProfile, { method: 'PATCH', as, body });

  it('refuses an unauthenticated call', async () => {
    await expectError(await patch(undefined, { timezone: 'UTC' }), 401, 'UNAUTHENTICATED');
  });

  it('updates timezone, email reminders, and name', async () => {
    const response = await patch(ama.id, {
      timezone: 'Africa/Accra',
      email_reminders: false,
      name: 'Ama A. Mensah',
      school: 'University of Ghana',
    });
    expect(response.status).toBe(200);
    expectServerTime(response);
    const me = meResponseSchema.parse(await response.json());
    expect(me.user.name).toBe('Ama A. Mensah');
    expect(me.profile).toMatchObject({
      timezone: 'Africa/Accra',
      email_reminders: false,
      school: 'University of Ghana',
    });
  });

  it('only changes the caller, never another user', async () => {
    await patch(ama.id, { bio: 'Builds clinic tools' });
    const other = meResponseSchema.parse(await (await call(getMe, { as: efua.id })).json());
    expect(other.profile.bio).toBeNull();
  });

  it('rejects an unknown timezone name with VALIDATION_FAILED and field details', async () => {
    const body = await expectError(
      await patch(ama.id, { timezone: 'Mars/Olympus_Mons' }),
      400,
      'VALIDATION_FAILED',
    );
    expect(body.error.details).toEqual([
      { path: 'timezone', message: expect.stringContaining('Unknown time zone') },
    ]);
  });

  it('gives field details for every invalid field', async () => {
    const body = await expectError(
      await patch(ama.id, { graduation_year: 'soon', email_reminders: 'yes' }),
      400,
      'VALIDATION_FAILED',
    );
    expect(body.error.details?.map((d) => d.path).sort()).toEqual([
      'email_reminders',
      'graduation_year',
    ]);
  });

  it('refuses fields that are not editable', async () => {
    await expectError(await patch(ama.id, { is_platform_admin: true }), 400, 'VALIDATION_FAILED');
  });

  it('refuses a body that is not JSON', async () => {
    const response = await call(patchProfile, { method: 'PATCH', as: ama.id, rawBody: '{oops' });
    await expectError(response, 400, 'VALIDATION_FAILED');
  });
});

describe('GET /users/{id}/profile', () => {
  it('returns public fields and an empty badge list, without auth', async () => {
    const response = await call(getPublicProfile, { params: { id: efua.id } });
    expect(response.status).toBe(200);
    expectServerTime(response);
    const json: unknown = await response.json();
    const profile = publicProfileSchema.strict().parse(json);
    expect(profile).toMatchObject({ id: efua.id, name: 'Efua Owusu', badges: [] });
    expect(JSON.stringify(json)).not.toContain(efua.email);
  });

  it('returns 404 for an unknown id and for a malformed id', async () => {
    await expectError(
      await call(getPublicProfile, { params: { id: crypto.randomUUID() } }),
      404,
      'NOT_FOUND',
    );
    await expectError(
      await call(getPublicProfile, { params: { id: 'not-a-uuid' } }),
      404,
      'NOT_FOUND',
    );
  });
});

describe('POST and DELETE /me/push-tokens', () => {
  const token = `ExponentPushToken[${crypto.randomUUID()}]`;

  it('refuses unauthenticated calls', async () => {
    await expectError(
      await call(postPushToken, { method: 'POST', body: { token, platform: 'android' } }),
      401,
      'UNAUTHENTICATED',
    );
    await expectError(
      await call(deletePushToken, { method: 'DELETE', body: { token } }),
      401,
      'UNAUTHENTICATED',
    );
  });

  it('registers a token, and registering it again is harmless', async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await call(postPushToken, {
        method: 'POST',
        as: ama.id,
        body: { token, platform: 'android' },
      });
      expect(response.status).toBe(201);
      expectServerTime(response);
      expect(pushTokenSchema.parse(await response.json())).toMatchObject({
        token,
        platform: 'android',
      });
    }
  });

  it('rejects an unknown platform', async () => {
    const response = await call(postPushToken, {
      method: 'POST',
      as: ama.id,
      body: { token, platform: 'pager' },
    });
    const body = await expectError(response, 400, 'VALIDATION_FAILED');
    expect(body.error.details?.[0]?.path).toBe('platform');
  });

  it('deletes the token with 204 and server_time', async () => {
    const response = await call(deletePushToken, { method: 'DELETE', as: ama.id, body: { token } });
    expect(response.status).toBe(204);
    expectServerTime(response);
  });
});

describe('unknown /api/v1 paths', () => {
  it('return 404 in the standard shape with server_time', async () => {
    await expectError(await call(notFoundGet, { path: '/api/v1/nope' }), 404, 'NOT_FOUND');
    await expectError(
      await call(notFoundPost, { method: 'POST', path: '/api/v1/nope' }),
      404,
      'NOT_FOUND',
    );
  });
});
