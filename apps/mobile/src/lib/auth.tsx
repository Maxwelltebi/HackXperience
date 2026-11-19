import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { parseAuthRedirect } from './auth-redirect';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export type Provider = 'google' | 'github';

interface AuthState {
  session: Session | null;
  /** False until the stored session has been read. */
  ready: boolean;
}

const AuthContext = createContext<AuthState>({ session: null, ready: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, ready: false });

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setState({ session: data.session, ready: true });
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ session, ready: true });
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/** The deep link OAuth returns to: hackxperience://auth/callback (or exp://…/--/auth/callback in Expo Go). */
export function authRedirectUrl(): string {
  return Linking.createURL('auth/callback');
}

/**
 * Google or GitHub sign-in in an in-app browser, then a PKCE code exchange.
 * Resolves with an error message to show, or null on success or when the person cancelled.
 */
export async function signIn(provider: Provider): Promise<string | null> {
  const redirectTo = authRedirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data.url) return "Couldn't reach the sign-in service. Try again.";

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return null;

  const parsed = parseAuthRedirect(result.url);
  if (parsed.kind === 'error') return parsed.message;
  if (parsed.kind === 'none') return "Sign-in didn't finish. Try again.";

  const exchange = await supabase.auth.exchangeCodeForSession(parsed.code);
  return exchange.error ? "Sign-in didn't finish. Try again." : null;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
