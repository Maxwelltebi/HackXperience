// Signs each test account in once and saves the browser session, so tests start signed in.
//
// Sign-in uses Supabase email-and-password (Q26), through the same @supabase/ssr cookie format
// the app reads. Google and GitHub can't be automated, and the app has no password form: the
// test accounts exist only on the dev project.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import {
  baseURL,
  DISPLAY_NAMES,
  emailFor,
  required,
  ROLES,
  storageStatePath,
  type Role,
} from './env';

const ENV_HINT = 'Add it to apps/web/.env.local (see README, "End-to-end tests").';

export default async function globalSetup(): Promise<void> {
  const url = required('NEXT_PUBLIC_SUPABASE_URL', ENV_HINT);
  const anonKey = required('NEXT_PUBLIC_SUPABASE_ANON_KEY', ENV_HINT);
  const password = required('E2E_PASSWORD', ENV_HINT);

  await assertEmailSignInEnabled(url, anonKey);
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) await ensureAccounts(url, serviceKey, password);

  for (const role of ROLES) {
    const cookies = await signIn(url, anonKey, emailFor(role), password, role);
    const path = storageStatePath(role);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ cookies, origins: [] }, null, 2));
  }
}

/**
 * The safety check for Q26: production has Email sign-in off, so the suite stops here, before
 * it creates accounts or data, if it is ever pointed at production.
 */
async function assertEmailSignInEnabled(url: string, anonKey: string): Promise<void> {
  const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey } });
  if (!response.ok) throw new Error(`Supabase auth settings answered ${response.status}.`);
  const settings = (await response.json()) as { external?: { email?: boolean } };
  if (!settings.external?.email) {
    throw new Error(
      'Email sign-in is off on this Supabase project. That is correct for production, and the ' +
        'end-to-end suite must never run there. On the dev project, turn on Authentication → ' +
        'Sign In / Providers → Email.',
    );
  }
}

/** Creates the four accounts if missing, and resets their password and name. Dev project only. */
async function ensureAccounts(url: string, serviceKey: string, password: string): Promise<void> {
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`Listing users failed: ${error.message}`);
  for (const role of ROLES) {
    const email = emailFor(role);
    const attributes = {
      password,
      email_confirm: true,
      user_metadata: { full_name: DISPLAY_NAMES[role] },
    };
    const existing = data.users.find((u) => u.email === email);
    const result = existing
      ? await admin.auth.admin.updateUserById(existing.id, attributes)
      : await admin.auth.admin.createUser({ email, ...attributes });
    if (result.error)
      throw new Error(`Setting up the ${role} account failed: ${result.error.message}`);
  }
}

interface PlaywrightCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Lax' | 'Strict' | 'None';
}

async function signIn(
  url: string,
  anonKey: string,
  email: string,
  password: string,
  role: Role,
): Promise<PlaywrightCookie[]> {
  const jar = new Map<string, { value: string; options: CookieOptions }>();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => [...jar].map(([name, { value }]) => ({ name, value })),
      setAll: (list) => {
        for (const { name, value, options } of list) jar.set(name, { value, options });
      },
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(
      `Signing in the ${role} test account (${email}) failed: ${error.message}. Create it in ` +
        'Supabase → Authentication → Users → Add user, with "Auto Confirm User" ticked and the ' +
        'E2E_PASSWORD password, or set SUPABASE_SERVICE_ROLE_KEY so the setup creates it.',
    );
  }
  // The session cookie is written by an async auth-state callback: wait for it.
  for (let i = 0; i < 50 && ![...jar.keys()].some((k) => k.includes('-auth-token')); i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (jar.size === 0) throw new Error(`No session cookie for the ${role} test account.`);

  const { hostname, protocol } = new URL(baseURL);
  const now = Math.floor(Date.now() / 1000);
  return [...jar].map(([name, { value, options }]) => ({
    name,
    value,
    domain: hostname,
    path: options.path ?? '/',
    expires: options.maxAge ? now + options.maxAge : -1,
    httpOnly: false,
    secure: protocol === 'https:',
    sameSite: 'Lax',
  }));
}
