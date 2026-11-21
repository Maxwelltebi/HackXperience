import 'server-only';
import { createVerify } from 'node:crypto';
import { z } from 'zod';
import { fetchSigningCertificate } from './sns-cert';

/** The SNS HTTP(S) delivery envelope. */
export const snsMessageSchema = z.object({
  Type: z.enum(['Notification', 'SubscriptionConfirmation', 'UnsubscribeConfirmation']),
  MessageId: z.string(),
  TopicArn: z.string(),
  Subject: z.string().nullish(),
  Message: z.string(),
  Timestamp: z.string(),
  SignatureVersion: z.enum(['1', '2']),
  Signature: z.string(),
  SigningCertURL: z.string(),
  SubscribeURL: z.string().optional(),
  Token: z.string().optional(),
});
export type SnsMessage = z.infer<typeof snsMessageSchema>;

/** Only AWS's own SNS hosts, over HTTPS: sns.<region>.amazonaws.com. */
export function isAwsSnsUrl(value: string, pathSuffix?: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      /^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(url.hostname) &&
      (!pathSuffix || url.pathname.endsWith(pathSuffix))
    );
  } catch {
    return false;
  }
}

/** The exact string AWS signs, per message type (AWS SNS "Verifying message signatures"). */
export function snsStringToSign(message: SnsMessage): string {
  const keys =
    message.Type === 'Notification'
      ? ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type']
      : ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'];
  const record = message as Record<string, unknown>;
  return keys
    .filter((key) => record[key] !== undefined && record[key] !== null)
    .map((key) => `${key}\n${String(record[key])}\n`)
    .join('');
}

/** Messages older than this are refused, so a captured message can't be replayed later. */
const MAX_AGE_MS = 60 * 60 * 1000;

/**
 * True only when the message was signed by AWS for our topic: the certificate URL is an AWS
 * SNS host, the topic matches, the timestamp is recent, and the RSA signature verifies.
 */
export async function verifySnsMessage(
  message: SnsMessage,
  expectedTopicArn: string | undefined,
  now: Date = new Date(),
): Promise<boolean> {
  if (!expectedTopicArn || message.TopicArn !== expectedTopicArn) return false;
  if (!isAwsSnsUrl(message.SigningCertURL, '.pem')) return false;
  const sentAt = Date.parse(message.Timestamp);
  if (Number.isNaN(sentAt) || Math.abs(now.getTime() - sentAt) > MAX_AGE_MS) return false;

  let certificate: string;
  try {
    certificate = await fetchSigningCertificate(message.SigningCertURL);
  } catch {
    return false;
  }
  const algorithm = message.SignatureVersion === '2' ? 'RSA-SHA256' : 'RSA-SHA1';
  try {
    return createVerify(algorithm)
      .update(snsStringToSign(message), 'utf8')
      .verify(certificate, message.Signature, 'base64');
  } catch {
    return false;
  }
}

/** Addresses to suppress from an SES bounce or complaint notification (inside Message). */
export function suppressionsFromSesEvent(
  raw: string,
): { reason: 'bounce' | 'complaint'; emails: string[] } | null {
  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = sesEventSchema.safeParse(event);
  if (!parsed.success) return null;
  const type = parsed.data.notificationType ?? parsed.data.eventType;

  if (type === 'Bounce' && parsed.data.bounce) {
    // Transient bounces (full mailbox, out of office) are not a reason to stop emailing.
    if (parsed.data.bounce.bounceType !== 'Permanent') return null;
    return {
      reason: 'bounce',
      emails: parsed.data.bounce.bouncedRecipients.map((r) => r.emailAddress),
    };
  }
  if (type === 'Complaint' && parsed.data.complaint) {
    return {
      reason: 'complaint',
      emails: parsed.data.complaint.complainedRecipients.map((r) => r.emailAddress),
    };
  }
  return null;
}

const recipients = z.array(z.object({ emailAddress: z.string() }));
const sesEventSchema = z.object({
  notificationType: z.string().optional(),
  eventType: z.string().optional(),
  bounce: z.object({ bounceType: z.string(), bouncedRecipients: recipients }).optional(),
  complaint: z.object({ complainedRecipients: recipients }).optional(),
});
