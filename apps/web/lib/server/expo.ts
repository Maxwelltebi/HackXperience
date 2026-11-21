import 'server-only';
import type { PushDeps, PushReceipt, PushTicket } from '@hx/db';
import { appUrl } from './ses';

const EXPO = 'https://exp.host/--/api/v2/push';

/**
 * Expo's push API. EXPO_ACCESS_TOKEN (server only, Agent rule 17) is needed only if the Expo
 * project turns on enhanced push security; without it requests are still accepted.
 */
export function createPushDeps(
  token: string | undefined,
  fetchImpl: typeof fetch = fetch,
): PushDeps {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/json',
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const post = async (path: string, body: unknown) => {
    const response = await fetchImpl(`${EXPO}/${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Expo answered ${response.status}`);
    return (await response.json()) as { data?: unknown };
  };
  return {
    appUrl: appUrl(),
    send: async (messages) => {
      const { data } = await post('send', messages);
      if (!Array.isArray(data) || data.length !== messages.length) {
        throw new Error('Expo returned an unexpected number of tickets');
      }
      return data as PushTicket[];
    },
    getReceipts: async (ids) => {
      const { data } = await post('getReceipts', { ids });
      return (data ?? {}) as Record<string, PushReceipt>;
    },
  };
}

export function pushDeps(): PushDeps {
  return createPushDeps(process.env.EXPO_ACCESS_TOKEN || undefined);
}
