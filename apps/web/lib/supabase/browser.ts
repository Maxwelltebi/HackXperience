'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null | undefined;

/**
 * The browser's Supabase client, used only for realtime channels (data always goes through
 * /api/v1). Null when sign-in isn't configured on this computer; live pages then poll.
 */
export function browserSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  client = url && key && key !== 'local-placeholder' ? createBrowserClient(url, key) : null;
  return client;
}
