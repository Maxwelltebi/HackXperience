import { randomUUID } from 'node:crypto';
import {
  canSeeEvent,
  getSql,
  loadEventRoles,
  PG_ERROR,
  PostgresError,
  type EventAccess,
} from '@hx/db';
import {
  ApiError,
  can,
  clientIdSchema,
  IDEMPOTENCY_KEY_HEADER,
  type ErrorCode,
  type FieldErrors,
  type Permission,
} from '@hx/shared';
import type { z, ZodType } from 'zod';
import { authenticate } from './auth';
import { errorResponse, withServerTime } from './respond';

type AuthMode = 'required' | 'optional' | 'none';

type Infer<S> = S extends ZodType ? z.output<S> : undefined;

/** Load the event named by a route parameter and the caller's roles at it. */
export interface EventOption {
  /** Route parameter holding the event id. Default 'id'. */
  param?: string;
  /**
   * Who may call this endpoint (DESIGN Step 4 permission matrix). Without it, anyone who
   * can see the event may: everyone for published events, owners and admins for drafts.
   */
  permission?: Permission;
}

interface HandlerOptions<A extends AuthMode, B, P, Q, E> {
  /** Default 'required': no verified user means 401. */
  auth?: A;
  /** Zod schema for the JSON body. */
  body?: B;
  /** Zod schema for the route parameters, e.g. { id }. */
  params?: P;
  /** Zod schema for the query string (values are strings). */
  query?: Q;
  /**
   * Accept a client-generated UUID for a create (Agent rule 14, Design Step 4), sent as the
   * body's `id` or the `Idempotency-Key` header. `ctx.id` is that id, or a new one when the
   * client sent none. Insert with ON CONFLICT (id) DO NOTHING and return the existing row.
   */
  clientId?: boolean;
  /**
   * The event this endpoint acts on. Missing, deleted, or a draft the caller can't see:
   * 404. Visible but the caller lacks `permission`: 403.
   */
  event?: E;
}

export interface HandlerContext<A extends AuthMode, B, P, Q, E> {
  request: Request;
  userId: A extends 'required' ? string : string | null;
  body: Infer<B>;
  params: Infer<P>;
  query: Infer<Q>;
  /** The row id for a create. Only meaningful with the clientId option. */
  id: string;
  /** The event and the caller's roles at it, when the `event` option is set. */
  access: E extends EventOption ? EventAccess : null;
}

interface RouteContext {
  params?: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The wrapper every /api/v1 endpoint uses (Agent rule 11): auth, Zod validation,
 * event roles and permission checks, error mapping to the one error shape, and the
 * server_time header on every response.
 */
export function handler<
  A extends AuthMode = 'required',
  B extends ZodType | undefined = undefined,
  P extends ZodType | undefined = undefined,
  Q extends ZodType | undefined = undefined,
  E extends EventOption | undefined = undefined,
>(
  options: HandlerOptions<A, B, P, Q, E>,
  fn: (ctx: HandlerContext<A, B, P, Q, E>) => Promise<Response>,
): (request: Request, context?: RouteContext) => Promise<Response> {
  return async (request, context) => {
    const startedAt = new Date();
    try {
      const ctx = await buildContext(request, context, options);
      return withServerTime(await fn(ctx), startedAt);
    } catch (error) {
      return withServerTime(toErrorResponse(error, request), startedAt);
    }
  };
}

async function buildContext<
  A extends AuthMode,
  B extends ZodType | undefined,
  P extends ZodType | undefined,
  Q extends ZodType | undefined,
  E extends EventOption | undefined,
>(
  request: Request,
  context: RouteContext | undefined,
  options: HandlerOptions<A, B, P, Q, E>,
): Promise<HandlerContext<A, B, P, Q, E>> {
  const mode: AuthMode = options.auth ?? 'required';
  const userId = mode === 'none' ? null : await authenticate(request);
  if (mode === 'required' && !userId) {
    throw new ApiError('UNAUTHENTICATED', 'Sign in to continue.');
  }

  const rawParams = (await context?.params) ?? {};
  const params = options.params ? parse(options.params, rawParams, 'params') : undefined;
  const access = options.event ? await loadAccess(options.event, rawParams, userId) : null;
  const query = options.query
    ? parse(options.query, Object.fromEntries(new URL(request.url).searchParams), 'query')
    : undefined;

  let body: unknown;
  let id: string = randomUUID();
  if (options.body || options.clientId) {
    const raw = await readJson(request);
    if (options.clientId) {
      id = readClientId(request, raw) ?? id;
    }
    body = options.body ? parse(options.body, withoutId(raw, options.clientId), 'body') : undefined;
  }

  return { request, userId, body, params, query, id, access } as HandlerContext<A, B, P, Q, E>;
}

async function loadAccess(
  option: EventOption,
  rawParams: Record<string, string | string[] | undefined>,
  userId: string | null,
): Promise<EventAccess> {
  const eventId = rawParams[option.param ?? 'id'];
  const parsed = clientIdSchema.safeParse(eventId);
  if (!parsed.success) throw new ApiError('NOT_FOUND', 'No such event.');

  const access = await loadEventRoles(getSql(), parsed.data, userId);
  if (!access || !canSeeEvent(access)) throw new ApiError('NOT_FOUND', 'No such event.');
  if (option.permission && !can(access.roles, option.permission)) {
    if (!userId) throw new ApiError('UNAUTHENTICATED', 'Sign in to continue.');
    throw new ApiError('FORBIDDEN', "You don't have access to this.");
  }
  return access;
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.trim() === '') {
    throw new ApiError('VALIDATION_FAILED', 'The request body must be JSON.');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError('VALIDATION_FAILED', 'The request body must be JSON.');
  }
}

function readClientId(request: Request, raw: unknown): string | null {
  const fromBody = isRecord(raw) && raw.id !== undefined ? uuidOrThrow(raw.id, 'id') : null;
  const header = request.headers.get(IDEMPOTENCY_KEY_HEADER);
  const fromHeader = header === null ? null : uuidOrThrow(header.trim(), IDEMPOTENCY_KEY_HEADER);
  if (fromBody && fromHeader && fromBody !== fromHeader) {
    throw ApiError.validation('The id and the Idempotency-Key header disagree.', {
      id: 'Must match the Idempotency-Key header.',
    });
  }
  return fromBody ?? fromHeader;
}

function uuidOrThrow(value: unknown, field: string): string {
  const parsed = clientIdSchema.safeParse(value);
  if (!parsed.success) {
    throw ApiError.validation(`The ${field} must be a UUID.`, { [field]: 'Must be a UUID.' });
  }
  return parsed.data;
}

function withoutId(raw: unknown, clientId: boolean | undefined): unknown {
  if (!clientId || !isRecord(raw)) return raw;
  const { id: _id, ...rest } = raw;
  return rest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parse(schema: ZodType, value: unknown, where: 'body' | 'params' | 'query'): unknown {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  if (where === 'params') {
    throw new ApiError('NOT_FOUND', 'Not found.');
  }
  throw ApiError.validation('Some fields need fixing.', toFieldErrors(result.error));
}

/** Zod issues as { "dotted.path": "message" }, keeping the first message per field. */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const fields: FieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.map(String).join('.') || '_';
    fields[path] ??= issue.message;
  }
  return fields;
}

function toErrorResponse(error: unknown, request: Request): Response {
  if (error instanceof ApiError) {
    return errorResponse(error.code, error.message, error.details);
  }
  // Log the method, path and database error code only: messages can contain emails (Agent rule 17).
  const path = new URL(request.url).pathname;
  if (error instanceof PostgresError) {
    const mapped = mapPostgresError(error.code);
    if (mapped) return errorResponse(mapped.code, mapped.message);
    console.error(`[api] ${request.method} ${path} failed: postgres ${error.code}`);
  } else {
    console.error(
      `[api] ${request.method} ${path} failed: ${error instanceof Error ? error.name : 'unknown'}`,
    );
  }
  return errorResponse('INTERNAL', 'Something went wrong. Try again.');
}

/** Database errors a client can act on. The rest are 500s. */
function mapPostgresError(code: string): { code: ErrorCode; message: string } | null {
  switch (code) {
    case PG_ERROR.uniqueViolation:
      return { code: 'CONFLICT', message: 'That already exists.' };
    case PG_ERROR.foreignKeyViolation:
      return {
        code: 'CONFLICT',
        message: 'Something else still refers to this, or it no longer exists.',
      };
    case PG_ERROR.checkViolation:
      return { code: 'VALIDATION_FAILED', message: 'Some values are out of range.' };
    case PG_ERROR.deadlock:
    case PG_ERROR.serializationFailure:
    case PG_ERROR.lockNotAvailable:
      return { code: 'SERVICE_UNAVAILABLE', message: 'Busy right now. Try again.' };
    default:
      return null;
  }
}
