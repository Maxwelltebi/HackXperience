import 'server-only';
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import type { OutboxDeps } from '@hx/db';

let client: SESv2Client | undefined;

/**
 * The outbox's email dependencies, or null when SES isn't configured yet, so emails wait
 * in the outbox instead of failing. AWS credentials come from AWS_ACCESS_KEY_ID and
 * AWS_SECRET_ACCESS_KEY, read by the SDK (server env only, Agent rule 17).
 */
export function outboxDeps(): OutboxDeps | null {
  const region = process.env.AWS_REGION;
  const from = process.env.SES_FROM;
  if (!region || !from || !process.env.AWS_ACCESS_KEY_ID) return null;
  client ??= new SESv2Client({ region });
  const ses = client;
  const replyTo = process.env.SES_REPLY_TO;

  return {
    appUrl: appUrl(),
    sendEmail: async ({ to, subject, html, text }) => {
      const result = await ses.send(
        new SendEmailCommand({
          FromEmailAddress: from,
          Destination: { ToAddresses: [to] },
          ReplyToAddresses: replyTo ? [replyTo] : undefined,
          Content: {
            Simple: {
              Subject: { Data: subject, Charset: 'UTF-8' },
              Body: {
                Html: { Data: html, Charset: 'UTF-8' },
                Text: { Data: text, Charset: 'UTF-8' },
              },
            },
          },
        }),
      );
      return { messageId: result.MessageId ?? '' };
    },
  };
}

/** Public base URL for links in emails. */
export function appUrl(): string {
  return (process.env.APP_URL ?? 'https://hack.ciren.network').replace(/\/+$/, '');
}
