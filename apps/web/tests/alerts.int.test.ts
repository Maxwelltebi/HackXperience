// R42: event alert sign-ups from the pop-up, and unsubscribing. Both need no account.
import { getSql } from '@hx/db';
import { alertSignupResultSchema, alertUnsubscribeResultSchema, fieldErrorsOf } from '@hx/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { POST as signUp } from '@/app/api/v1/alerts/route';
import { POST as unsubscribe } from '@/app/api/v1/alerts/unsubscribe/route';
import { call, expectError, fixtures } from './helpers';

const fx = fixtures();
const sql = getSql();
const emails: string[] = [];
afterAll(async () => {
  await sql`delete from alert_subscribers where email = any(${emails})`;
  await sql`delete from rate_limit_counters where key like 'alerts:203.0.113.%'`;
  await fx.cleanup();
});

/** A unique address, removed after the tests. */
function address(): string {
  const email = `alert-${crypto.randomUUID()}@example.test`;
  emails.push(email);
  return email;
}

/** Each test its own documentation-range IP address, so rate limits don't cross tests. */
let ip = 0;
const fromIp = () => ({ 'x-forwarded-for': `203.0.113.${++ip}, 10.0.0.1` });

async function subscriber(email: string) {
  const [row] = await sql<[{ unsubscribe_token: string; unsubscribed_at: Date | null }?]>`
    select unsubscribe_token, unsubscribed_at from alert_subscribers where email = ${email}
  `;
  return row;
}

describe('POST /alerts', () => {
  it('signs up anyone, signed in or not, in lower case, and answers the same the second time', async () => {
    const email = address();
    const headers = fromIp();
    const first = await call(signUp, {
      method: 'POST',
      body: { email: `  ${email.toUpperCase()} ` },
      headers,
    });
    expect(first.status).toBe(200);
    expect(alertSignupResultSchema.parse(await first.json())).toEqual({ subscribed: true });
    expect(await subscriber(email)).toBeDefined();

    const { people } = await fx.eventWithRoles();
    const again = await call(signUp, {
      method: 'POST',
      as: people.participant.id,
      body: { email },
      headers,
    });
    expect(again.status).toBe(200);
    const rows = await sql`select 1 from alert_subscribers where email = ${email}`;
    expect(rows).toHaveLength(1);
  });

  it('refuses something that is not an email address', async () => {
    const body = await expectError(
      await call(signUp, { method: 'POST', body: { email: 'not-an-email' }, headers: fromIp() }),
      400,
      'VALIDATION_FAILED',
    );
    expect(Object.keys(fieldErrorsOf(body.error.details))).toEqual(['email']);
  });

  it('answers a bot that fills in the hidden field, but stores nothing', async () => {
    const email = address();
    const response = await call(signUp, {
      method: 'POST',
      body: { email, website: 'https://spam.example' },
      headers: fromIp(),
    });
    expect(response.status).toBe(200);
    expect(await subscriber(email)).toBeUndefined();
  });

  it('allows 5 sign-ups a minute from one IP address', async () => {
    const headers = fromIp();
    for (let i = 0; i < 5; i++) {
      const response = await call(signUp, { method: 'POST', body: { email: address() }, headers });
      expect(response.status).toBe(200);
    }
    await expectError(
      await call(signUp, { method: 'POST', body: { email: address() }, headers }),
      429,
      'RATE_LIMITED',
    );
  });
});

describe('POST /alerts/unsubscribe', () => {
  it('unsubscribes with the token from the email; signing up again turns alerts back on', async () => {
    const email = address();
    await call(signUp, { method: 'POST', body: { email }, headers: fromIp() });
    const token = (await subscriber(email))?.unsubscribe_token;
    if (!token) throw new Error('subscriber expected');

    const response = await call(unsubscribe, { method: 'POST', body: { token } });
    expect(response.status).toBe(200);
    expect(alertUnsubscribeResultSchema.parse(await response.json())).toEqual({
      unsubscribed: true,
    });
    expect((await subscriber(email))?.unsubscribed_at).not.toBeNull();

    await call(signUp, { method: 'POST', body: { email }, headers: fromIp() });
    expect((await subscriber(email))?.unsubscribed_at).toBeNull();
  });

  it('refuses an unknown or malformed token', async () => {
    await expectError(
      await call(unsubscribe, { method: 'POST', body: { token: crypto.randomUUID() } }),
      404,
      'NOT_FOUND',
    );
    await expectError(
      await call(unsubscribe, { method: 'POST', body: { token: 'abc' } }),
      400,
      'VALIDATION_FAILED',
    );
  });
});
