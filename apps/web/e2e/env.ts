// Settings for the end-to-end suite (Q26: email-and-password test accounts on the DEV project).
// Never point this at production: production keeps the Email sign-in provider switched off, and
// the global setup stops before touching any data if it finds it off.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envFile = fileURLToPath(new URL('../.env.local', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

export const ROLES = ['organizer', 'judge', 'alice', 'bob'] as const;
export type Role = (typeof ROLES)[number];

export const DISPLAY_NAMES: Record<Role, string> = {
  organizer: 'E2E Organizer',
  judge: 'E2E Judge',
  alice: 'E2E Alice',
  bob: 'E2E Bob',
};

/** Where the app runs. Defaults to `pnpm dev` on this machine. */
export const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

/** The test account emails. Change the domain if Supabase rejects example.com. */
export function emailFor(role: Role): string {
  return `hx-e2e-${role}@${process.env.E2E_EMAIL_DOMAIN ?? 'example.com'}`;
}

/** Saved browser sign-ins, one per role (git-ignored). */
export function storageStatePath(role: Role): string {
  return fileURLToPath(new URL(`./.auth/${role}.json`, import.meta.url));
}

export function required(name: string, hint: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. ${hint}`);
  return value;
}
