import { addSuppressions, getSql } from '@hx/db';
import { ApiError } from '@hx/shared';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';
import {
  isAwsSnsUrl,
  snsMessageSchema,
  suppressionsFromSesEvent,
  verifySnsMessage,
} from '@/lib/server/sns';

export const dynamic = 'force-dynamic';

/**
 * POST /api/internal/ses-events: SES bounces and complaints, delivered by SNS.
 * The SNS signature and topic are verified before anything else (Agent rule 18).
 * SNS posts JSON with a text/plain content type, so the body is read as text.
 */
export const POST = handler({ auth: 'none' }, async ({ request }) => {
  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    throw new ApiError('VALIDATION_FAILED', 'Not an SNS message.');
  }
  const parsed = snsMessageSchema.safeParse(body);
  if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'Not an SNS message.');
  const message = parsed.data;

  if (!(await verifySnsMessage(message, process.env.SNS_TOPIC_ARN))) {
    throw new ApiError('FORBIDDEN', 'Signature check failed.');
  }

  if (message.Type === 'SubscriptionConfirmation') {
    if (!message.SubscribeURL || !isAwsSnsUrl(message.SubscribeURL)) {
      throw new ApiError('VALIDATION_FAILED', 'Bad subscribe URL.');
    }
    const confirm = await fetch(message.SubscribeURL, { signal: AbortSignal.timeout(5_000) });
    return json({ confirmed: confirm.ok });
  }
  if (message.Type === 'UnsubscribeConfirmation') return json({ ok: true });

  const suppression = suppressionsFromSesEvent(message.Message);
  if (!suppression) return json({ recorded: 0 });
  const recorded = await addSuppressions(getSql(), suppression.emails, suppression.reason);
  return json({ recorded });
});
