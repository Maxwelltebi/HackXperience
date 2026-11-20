// Internal endpoints: the tick secret and SNS signature checks (Agent rule 18).
import { createSign, generateKeyPairSync } from 'node:crypto';
import { closeSql, getSql } from '@hx/db';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { POST as sesEvents } from '@/app/api/internal/ses-events/route';
import { POST as tick } from '@/app/api/internal/tick/route';
import { snsStringToSign, type SnsMessage } from '@/lib/server/sns';
import { expectError, expectServerTime } from './helpers';

// AWS's signing key, played by a key made here. Only the certificate fetch is replaced.
const keys = await vi.hoisted(async () => {
  const { generateKeyPairSync: generate } = await import('node:crypto');
  return generate('rsa', { modulusLength: 2048 });
});
vi.mock('@/lib/server/sns-cert', () => ({
  fetchSigningCertificate: async () =>
    keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
}));

const TOPIC = 'arn:aws:sns:eu-west-2:123456789012:hx-ses-events';
const sql = getSql();
const testEmails: string[] = [];

beforeAll(() => {
  vi.stubEnv('TICK_SECRET', 'test-tick-secret');
  vi.stubEnv('SNS_TOPIC_ARN', TOPIC);
  vi.stubEnv('AWS_ACCESS_KEY_ID', '');
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await sql`delete from email_suppressions where email = any(${testEmails}::text[])`;
  vi.unstubAllEnvs();
  await closeSql();
});

function post(
  route: (r: Request) => Promise<Response>,
  body: string,
  headers: Record<string, string> = {},
) {
  return route(new Request('http://localhost/api/internal/x', { method: 'POST', body, headers }));
}

describe('POST /api/internal/tick', () => {
  it('refuses a missing or wrong secret', async () => {
    await expectError(await post(tick, '{}'), 401, 'UNAUTHENTICATED');
    await expectError(await post(tick, '{}', { 'x-tick-secret': 'wrong' }), 401, 'UNAUTHENTICATED');
  });

  it('runs with the right secret; without SES config, emails wait in the outbox', async () => {
    const response = await post(tick, '{}', { 'x-tick-secret': 'test-tick-secret' });
    expect(response.status).toBe(200);
    expectServerTime(response);
    const body = (await response.json()) as { skipped: boolean; outbox?: unknown };
    if (!body.skipped) expect(body.outbox).toBe('not_configured');
  });
});

function signed(
  message: Omit<SnsMessage, 'Signature' | 'SignatureVersion' | 'SigningCertURL'>,
  key = keys.privateKey,
) {
  const full: SnsMessage = {
    ...message,
    SignatureVersion: '2',
    SigningCertURL: 'https://sns.eu-west-2.amazonaws.com/SimpleNotificationService-abc.pem',
    Signature: '',
  };
  full.Signature = createSign('RSA-SHA256').update(snsStringToSign(full)).sign(key, 'base64');
  return full;
}

function bounce(email: string, bounceType = 'Permanent') {
  return signed({
    Type: 'Notification',
    MessageId: crypto.randomUUID(),
    TopicArn: TOPIC,
    Message: JSON.stringify({
      notificationType: 'Bounce',
      bounce: { bounceType, bouncedRecipients: [{ emailAddress: email }] },
    }),
    Timestamp: new Date().toISOString(),
  });
}

describe('POST /api/internal/ses-events', () => {
  it('records a signed permanent bounce', async () => {
    const email = `bounce-${crypto.randomUUID()}@example.test`;
    testEmails.push(email);
    const response = await post(sesEvents, JSON.stringify(bounce(email)));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ recorded: 1 });
    const [row] = await sql`select reason::text from email_suppressions where email = ${email}`;
    expect(row?.reason).toBe('bounce');
  });

  it('records a complaint and ignores a transient bounce', async () => {
    const complainer = `complaint-${crypto.randomUUID()}@example.test`;
    const transient = `transient-${crypto.randomUUID()}@example.test`;
    testEmails.push(complainer, transient);
    const complaint = signed({
      Type: 'Notification',
      MessageId: crypto.randomUUID(),
      TopicArn: TOPIC,
      Message: JSON.stringify({
        notificationType: 'Complaint',
        complaint: { complainedRecipients: [{ emailAddress: complainer }] },
      }),
      Timestamp: new Date().toISOString(),
    });
    expect(await (await post(sesEvents, JSON.stringify(complaint))).json()).toEqual({
      recorded: 1,
    });
    expect(
      await (await post(sesEvents, JSON.stringify(bounce(transient, 'Transient')))).json(),
    ).toEqual({
      recorded: 0,
    });
  });

  it('rejects a forged message signed with another key', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const email = `forged-${crypto.randomUUID()}@example.test`;
    const forged = bounce(email);
    forged.Signature = createSign('RSA-SHA256')
      .update(snsStringToSign(forged))
      .sign(other.privateKey, 'base64');
    await expectError(await post(sesEvents, JSON.stringify(forged)), 403, 'FORBIDDEN');
    expect(await sql`select 1 from email_suppressions where email = ${email}`).toHaveLength(0);
  });

  it('rejects a message whose content was changed after signing', async () => {
    const message = bounce(`real-${crypto.randomUUID()}@example.test`);
    message.Message = message.Message.replace('real-', 'victim-');
    await expectError(await post(sesEvents, JSON.stringify(message)), 403, 'FORBIDDEN');
  });

  it('rejects a certificate URL that is not AWS, the wrong topic, and an old message', async () => {
    const offsite = {
      ...bounce('x@example.test'),
      SigningCertURL: 'https://evil.example/cert.pem',
    };
    await expectError(await post(sesEvents, JSON.stringify(offsite)), 403, 'FORBIDDEN');

    const wrongTopic = signed({
      ...bounce('x@example.test'),
      TopicArn: 'arn:aws:sns:eu-west-2:1:other',
    });
    await expectError(await post(sesEvents, JSON.stringify(wrongTopic)), 403, 'FORBIDDEN');

    const old = signed({
      ...bounce('x@example.test'),
      Timestamp: new Date(Date.now() - 2 * 3600_000).toISOString(),
    });
    await expectError(await post(sesEvents, JSON.stringify(old)), 403, 'FORBIDDEN');
  });

  it('confirms a signed subscription by visiting its AWS SubscribeURL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
    const url = 'https://sns.eu-west-2.amazonaws.com/?Action=ConfirmSubscription&Token=abc';
    const message = signed({
      Type: 'SubscriptionConfirmation',
      MessageId: crypto.randomUUID(),
      TopicArn: TOPIC,
      Message: 'You have chosen to subscribe',
      Timestamp: new Date().toISOString(),
      SubscribeURL: url,
      Token: 'abc',
    });
    const response = await post(sesEvents, JSON.stringify(message));
    expect(await response.json()).toEqual({ confirmed: true });
    expect(fetchSpy).toHaveBeenCalledWith(url, expect.anything());
  });

  it('rejects a body that is not an SNS message', async () => {
    await expectError(await post(sesEvents, 'not json'), 400, 'VALIDATION_FAILED');
  });
});
