import {
  API_PREFIX,
  SERVER_TIME_HEADER,
  errorBodySchema,
  fieldErrorsOf,
  type ErrorDetails,
  type FieldErrors,
} from '@hx/shared';

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | {
      ok: false;
      status: number;
      /** API error code, or NETWORK when the request never arrived. */
      code: string;
      message: string;
      fields: FieldErrors;
      details: ErrorDetails | undefined;
    };

let serverOffset = 0;

/**
 * Milliseconds to add to the device clock to get the server's (DESIGN Step 6 part 1: phone and
 * laptop clocks are wrong). Updated from the server_time header of every API response, and
 * seeded by pages that render with the server's clock.
 */
export function serverOffsetMs(): number {
  return serverOffset;
}

/** Record the server's clock as of now, e.g. from a server-rendered page. */
export function syncServerTime(serverIso: string): void {
  const server = Date.parse(serverIso);
  if (!Number.isNaN(server)) serverOffset = server - Date.now();
}

/**
 * Browser calls to /api/v1 with the session cookie. Never throws: failures come back as
 * `ok: false` with the error code, message and field problems ready for the form.
 */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${API_PREFIX}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    return {
      ok: false,
      status: 0,
      code: 'NETWORK',
      message: "Couldn't reach HackXperience. Check your connection and try again.",
      fields: {},
      details: undefined,
    };
  }

  const serverTime = response.headers.get(SERVER_TIME_HEADER);
  if (serverTime) syncServerTime(serverTime);

  const json: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (response.ok) return { ok: true, status: response.status, data: json as T };

  const parsed = errorBodySchema.safeParse(json);
  const error = parsed.success ? parsed.data.error : null;
  return {
    ok: false,
    status: response.status,
    code: error?.code ?? 'INTERNAL',
    message: error?.message ?? 'Something went wrong. Try again.',
    fields: fieldErrorsOf(error?.details),
    details: error?.details,
  };
}
