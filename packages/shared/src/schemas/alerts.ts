import { z } from 'zod';
import { uuidSchema } from './base';

/**
 * POST /alerts: sign an email address up for event alerts (R42). No account needed.
 * `website` is a field people never see: bots fill it in, and the sign-up is then ignored.
 */
export const alertSignupBodySchema = z
  .object({
    // Trimmed before the format check: a stray space from a phone keyboard isn't an error.
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254, 'That email is too long.')
      .pipe(z.email('Enter an email address.')),
    website: z.string().max(200).optional(),
  })
  .strict();
export type AlertSignupBody = z.infer<typeof alertSignupBodySchema>;

/** The same answer whether or not the address was already signed up, so it reveals nothing. */
export const alertSignupResultSchema = z.object({ subscribed: z.literal(true) });
export type AlertSignupResult = z.infer<typeof alertSignupResultSchema>;

/** POST /alerts/unsubscribe: the token from the link in every alert email. */
export const alertUnsubscribeBodySchema = z.object({ token: uuidSchema }).strict();
export const alertUnsubscribeResultSchema = z.object({ unsubscribed: z.literal(true) });
export type AlertUnsubscribeResult = z.infer<typeof alertUnsubscribeResultSchema>;
