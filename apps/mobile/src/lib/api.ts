import {
  API_PREFIX,
  ApiError,
  errorBodySchema,
  meResponseSchema,
  SERVER_TIME_HEADER,
  type MeResponse,
  type PatchProfileInput,
} from '@hx/shared';
import type { z } from 'zod';
import { supabase } from './supabase';

const baseUrl = process.env.EXPO_PUBLIC_API_URL;
if (!baseUrl) {
  throw new Error('EXPO_PUBLIC_API_URL must be set');
}

/** Milliseconds to add to the device clock to get server time. Countdowns use this, not the device clock. */
let serverOffsetMs = 0;

export function serverNow(): number {
  return Date.now() + serverOffsetMs;
}

/** Thrown when the request never reached the API (offline, DNS, timeout). */
export class NetworkError extends Error {
  constructor() {
    super("Couldn't reach HackXperience. Check your connection and try again.");
    this.name = 'NetworkError';
  }
}

async function request<S extends z.ZodType>(
  path: string,
  schema: S,
  init: { method?: string; body?: unknown } = {},
): Promise<z.output<S>> {
  const { data } = await supabase.auth.getSession();
  const headers: Record<string, string> = { accept: 'application/json' };
  if (data.session) headers.authorization = `Bearer ${data.session.access_token}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${API_PREFIX}${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new NetworkError();
  }

  const serverTime = Date.parse(response.headers.get(SERVER_TIME_HEADER) ?? '');
  if (!Number.isNaN(serverTime)) serverOffsetMs = serverTime - Date.now();

  const json: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = errorBodySchema.safeParse(json);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      throw new ApiError(code, message, details);
    }
    throw new ApiError('INTERNAL', 'Something went wrong. Try again.');
  }
  return schema.parse(json);
}

export const api = {
  getMe: (): Promise<MeResponse> => request('/me', meResponseSchema),
  patchProfile: (body: PatchProfileInput): Promise<MeResponse> =>
    request('/me/profile', meResponseSchema, { method: 'PATCH', body }),
};
