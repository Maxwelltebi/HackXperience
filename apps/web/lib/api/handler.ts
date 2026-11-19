import { randomUUID } from 'node:crypto';
import { PostgresError } from '@hx/db';
import { ApiError, clientIdSchema, type FieldError } from '@hx/shared';
import type { z, ZodType } from 'zod';
import { authenticate } from './auth';
import { errorResponse, withServerTime } from './respond';

type AuthMode = 'required' | 'optional' | 'none';

type Infer<S> = S extends ZodType ? z.output<S> : undefined;

interface HandlerOptions<A extends AuthMode, B, P, Q> {
  /** Default 'required': no verified user means 401. */
  auth?: A;
  /** Zod schema for the JSON body. */
  body?: B;
  /** Zod schema for the route parameters, e.g. { id }. */
  params?: P;
  /** Zod schema for the query string (values are strings). */
  query?: Q;
  /**
   * Accept a client-generated UUID `id` in the body (Agent rule 14). `ctx.id` is that id,
   * or a new one when the client sent none. Insert with ON CONFLICT (id) DO NOTHING.
   */
  clientId?: boolean;
}

export interface HandlerContext<A extends AuthMode, B, P, Q> {
  request: Request;
  userId: A extends 'required' ? string : string | null;
  body: Infer<B>;
  params: Infer<P>;
  query: Infer<Q>;
  /** The row id for a create. Only meaningful with the clientId option. */
  id: string;
}

interface RouteContext {
  params?: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The wrapper every /api/v1 endpoint uses (Agent rule 11): auth, Zod validation,
 * error mapping to the one error shape, and the server_time header on every response.
 * Role checks arrive with event roles in Phase 2.
 */
export function handler<
  A extends AuthMode = 'required',
  B extends ZodType | undefined = undefined,
  P extends ZodType | undefined = undefined,
  Q extends ZodType | undefined = undefined,
>(
  options: HandlerOptions<A, B, P, Q>,
  fn: (ctx: HandlerContext<A, B, P, Q>) => Promise<Response>,
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
>(
  request: Request,
  context: RouteContext | undefined,
  options: HandlerOptions<A, B, P, Q>,
): Promise<HandlerContext<A, B, P, Q>> {
  const mode: AuthMode = options.auth ?? 'required';
  const userId = mode === 'none' ? null : await authenticate(request);
  if (mode === 'required' && !userId) {
    throw new ApiError('UNAUTHENTICATED', 'Sign in to continue.');
  }

  const params = options.params
    ? parse(options.params, (await context?.params) ?? {}, 'params')
    : undefined;
  const query = options.query
    ? parse(options.query, Object.fromEntries(new URL(request.url).searchParams), 'query')
    : undefined;

  let body: unknown;
  let id: string = randomUUID();
  if (options.body || options.clientId) {
    const raw = await readJson(request);
    if (options.clientId) {
      id = readClientId(raw) ?? id;
    }
    body = options.body ? parse(options.body, withoutId(raw, options.clientId), 'body') : undefined;
  }

  return { request, userId, body, params, query, id } as HandlerContext<A, B, P, Q>;
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

function readClientId(raw: unknown): string | null {
  if (!isRecord(raw) || raw.id === undefined) return null;
  const parsed = clientIdSchema.safeParse(raw.id);
  if (!parsed.success) {
    throw new ApiError('VALIDATION_FAILED', 'The id must be a UUID.', [
      { path: 'id', message: 'Must be a UUID.' },
    ]);
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
  throw new ApiError('VALIDATION_FAILED', 'Some fields need fixing.', toFieldErrors(result.error));
}

export function toFieldErrors(error: z.ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

function toErrorResponse(error: unknown, request: Request): Response {
  if (error instanceof ApiError) {
    return errorResponse(error.code, error.message, error.details);
  }
  // Log the method, path and database error code only: messages can contain emails (Agent rule 17).
  const path = new URL(request.url).pathname;
  if (error instanceof PostgresError) {
    console.error(`[api] ${request.method} ${path} failed: postgres ${error.code}`);
  } else {
    console.error(
      `[api] ${request.method} ${path} failed: ${error instanceof Error ? error.name : 'unknown'}`,
    );
  }
  return errorResponse('INTERNAL', 'Something went wrong. Try again.');
}
