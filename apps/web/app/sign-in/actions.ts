'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { safeNext } from '@/lib/safe-next';
import { checkAuthAvailability } from '@/lib/supabase/availability';
import { supabaseEnv } from '@/lib/supabase/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const PROVIDERS = ['google', 'github'] as const;
type Provider = (typeof PROVIDERS)[number];

function isProvider(value: unknown): value is Provider {
  return PROVIDERS.includes(value as Provider);
}

/** Starts Google or GitHub OAuth through Supabase and sends the browser to the provider. */
export async function signInWithProvider(formData: FormData): Promise<void> {
  const provider = formData.get('provider');
  const next = safeNext(formData.get('next')?.toString());
  if (!isProvider(provider)) redirect('/sign-in?error=provider');

  const { url, anonKey } = supabaseEnv();
  const availability = await checkAuthAvailability(url, anonKey);
  if (availability === 'not_configured') redirect('/sign-in?error=not_configured');
  if (availability === 'unreachable') redirect('/sign-in?error=oauth');

  const origin = await requestOrigin();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect('/sign-in?error=oauth');
  redirect(data.url);
}

async function requestOrigin(): Promise<string> {
  const list = await headers();
  const origin = list.get('origin');
  if (origin) return origin;
  const host = list.get('x-forwarded-host') ?? list.get('host') ?? 'localhost:3000';
  const proto = list.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}
