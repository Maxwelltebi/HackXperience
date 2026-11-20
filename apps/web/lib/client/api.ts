import {
  API_PREFIX,
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

/**
 * Browser calls to /api/v1 with the session cookie. Never throws: failures come back as
 * `ok: false` with the error code, message and field problems ready for the form.
 */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${API_PREFIX}${path}`, {
      method: init.method ?? 'GET',
      headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
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
