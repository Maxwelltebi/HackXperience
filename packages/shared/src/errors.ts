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
  /** Staff invite: the person has never signed in, so there is no account to add. */
  USER_NOT_FOUND: 404,
  CONFLICT: 409,
  /** Event or application status change that the state machine does not allow. */
  INVALID_TRANSITION: 409,
  /** Removing the event's last owner. */
  LAST_OWNER: 409,
  /** Applying outside the application window, or to an event that is not open. */
  APPLICATIONS_CLOSED: 423,
  /** Deadline-sensitive write after the submission deadline or the lock (Agent rule 7). */
  SUBMISSION_LOCKED: 423,
  /** Teams and tickets are for applicants who confirmed their place. */
  NOT_CONFIRMED: 403,
  TEAM_FULL: 409,
  /** One team per person per event (DESIGN Step 6 part 2). */
  ALREADY_ON_TEAM: 409,
  INVALID_INVITE_CODE: 404,
  NOT_ON_TEAM: 404,
  /** Second scan of a ticket; details.checked_in_at holds the first time. */
  ALREADY_CHECKED_IN: 409,
  TICKET_NOT_FOUND: 404,
  /** The ticket exists but its holder declined their place. */
  TICKET_CANCELLED: 409,
  /**
   * Submission save with an old If-Match version: a teammate saved first.
   * details.current holds the saved submission, so the client can show both versions.
   */
  STALE_VERSION: 409,
  STORAGE_NOT_CONFIGURED: 503,
  /** Submit pressed by a team smaller than the event's team_size_min. */
  TEAM_TOO_SMALL: 409,
  /** Scores can only be entered or changed while the event status is judging. */
  JUDGING_CLOSED: 423,
  /** Results, the gallery and judge feedback are public only once the event is completed. */
  RESULTS_NOT_PUBLISHED: 404,
  /** Award winners and the rubric are frozen once results are published. */
  RESULTS_PUBLISHED: 409,
  /** A mentor claim that lost the race: another mentor claimed it first. */
  ALREADY_CLAIMED: 409,
  /** Mentor requests are open only while the event is live. */
  MENTORING_CLOSED: 423,
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
