import { z } from 'zod';

/**
 * Every error code the API can return, with its HTTP status.
 * Add a code here before using it anywhere else (Agent rule 13).
 */
export const ERROR_STATUS = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export const ERROR_CODES = Object.keys(ERROR_STATUS) as [ErrorCode, ...ErrorCode[]];

export const errorCodeSchema = z.enum(ERROR_CODES);

/** One problem with one field of a request. `path` is dotted, e.g. "timezone" or "answers.q1". */
export const fieldErrorSchema = z.object({
  path: z.string(),
  message: z.string(),
});
export type FieldError = z.infer<typeof fieldErrorSchema>;

/** The one error shape. Every non-2xx response from /api/v1 has this body. */
export const errorBodySchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    details: z.array(fieldErrorSchema).optional(),
  }),
});
export type ErrorBody = z.infer<typeof errorBodySchema>;

export function errorStatus(code: ErrorCode): number {
  return ERROR_STATUS[code];
}

/** Thrown by server code and turned into an error response by handler(). */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly details: FieldError[] | undefined;

  constructor(code: ErrorCode, message: string, details?: FieldError[]) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }

  get status(): number {
    return errorStatus(this.code);
  }

  toBody(): ErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}
