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

/**
 * Field problems in a VALIDATION_FAILED response, keyed by dotted path:
 * { "timezone": "Unknown time zone...", "answers.q1": "Required" }.
 */
export const fieldErrorsSchema = z.record(z.string(), z.string());
export type FieldErrors = z.infer<typeof fieldErrorsSchema>;

/**
 * Extra context for an error (Design Step 4: `"details": {}`). VALIDATION_FAILED puts
 * its field problems under `fields`; other codes add their own keys, e.g. the first
 * check-in time for ALREADY_CHECKED_IN.
 */
export const errorDetailsSchema = z.record(z.string(), z.unknown());
export type ErrorDetails = z.infer<typeof errorDetailsSchema>;

/** The one error shape. Every non-2xx response from /api/v1 has this body. */
export const errorBodySchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    details: errorDetailsSchema.optional(),
  }),
});
export type ErrorBody = z.infer<typeof errorBodySchema>;

export function errorStatus(code: ErrorCode): number {
  return ERROR_STATUS[code];
}

/** Thrown by server code and turned into an error response by handler(). */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly details: ErrorDetails | undefined;

  constructor(code: ErrorCode, message: string, details?: ErrorDetails) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }

  /** A 400 VALIDATION_FAILED carrying field problems in details.fields. */
  static validation(message: string, fields: FieldErrors): ApiError {
    return new ApiError('VALIDATION_FAILED', message, { fields });
  }

  get status(): number {
    return errorStatus(this.code);
  }

  /** The field problems, or {} when there are none. */
  get fieldErrors(): FieldErrors {
    return fieldErrorsOf(this.details);
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

/** Reads details.fields from an error's details, ignoring anything malformed. */
export function fieldErrorsOf(details: ErrorDetails | undefined): FieldErrors {
  const parsed = fieldErrorsSchema.safeParse(details?.fields);
  return parsed.success ? parsed.data : {};
}
