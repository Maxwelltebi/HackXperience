import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ApiError, PROJECT_IMAGES } from '@hx/shared';

/*
 * Project image storage (R41) in the Supabase bucket `project-images`. Only this file uses the
 * service-role key, which stays on the server (Agent rule 17). Browsers upload straight to
 * storage with a one-time signed link made here, so files never pass through the API.
 * Never call these inside a database transaction (Agent rule 9).
 */

let admin: SupabaseClient | null = null;

function storage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new ApiError(
      'STORAGE_NOT_CONFIGURED',
      "Image uploads aren't set up on this server yet. Ask the organizers.",
    );
  }
  admin ??= createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return admin.storage.from(PROJECT_IMAGES.bucket);
}

/** A one-time link the browser uploads the file to. */
export async function createUploadLink(path: string): Promise<{ path: string; token: string }> {
  const { data, error } = await storage().createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Could not create an upload link: ${error?.message ?? ''}`);
  return { path: data.path, token: data.token };
}

/** Whether the upload finished: the file is in the bucket. */
export async function fileExists(path: string): Promise<boolean> {
  const { data, error } = await storage().exists(path);
  if (error) return false;
  return data;
}

/** Removes a file. A failure is logged and ignored: an orphaned file harms nothing. */
export async function removeFile(path: string): Promise<void> {
  const { error } = await storage().remove([path]);
  if (error) console.warn('project image not removed from storage', { path, error: error.message });
}
