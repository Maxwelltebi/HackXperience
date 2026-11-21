import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertIcon, CodeIcon, LockIcon, MailIcon } from '@/components/icons';
import { safeNext } from '@/lib/safe-next';
import { getSessionUserId } from '@/lib/supabase/server';
import { signInWithProvider } from './actions';
import styles from './page.module.css';

export const metadata: Metadata = { title: 'Sign in' };

const ERRORS: Record<string, string> = {
  oauth: "Couldn't reach the sign-in service. Try again.",
  callback: "Sign-in didn't finish. Try again.",
  provider: 'Choose Google or GitHub.',
  not_configured:
    "Sign-in isn't set up on this computer yet. The README's Mode B explains how to connect a dev Supabase project.",
};

interface Props {
  searchParams: Promise<{ next?: string; error?: string }>;
}

export default async function SignInPage({ searchParams }: Props) {
  const { next: rawNext, error } = await searchParams;
  const next = safeNext(rawNext);
  if (await getSessionUserId()) redirect(next);
  const message = error ? (ERRORS[error] ?? ERRORS.callback) : null;

  return (
    <main className={styles.page}>
      <div className={styles.stack}>
        <div className={`raised ${styles.card}`}>
          <Link href="/" className={styles.mark} aria-label="HackXperience home">
            <span className={styles.markInner}>
              H<span className="x">X</span>
            </span>
          </Link>
          <h1 className={styles.wordmark}>
            <strong>
              Hack<span className="x">X</span>perience
            </strong>
            <span>BY CIReN</span>
          </h1>
          <p className={styles.intro}>Sign in to apply, join your team and submit your project.</p>

          {message ? (
            <p className="banner banner-danger" role="alert" style={{ width: '100%', margin: 0 }}>
              <AlertIcon /> {message}
            </p>
          ) : null}

          <form action={signInWithProvider} className={styles.buttons}>
            <input type="hidden" name="next" value={next} />
            <button className="btn btn-lg btn-block" type="submit" name="provider" value="google">
              <MailIcon /> Continue with Google
            </button>
            <button className="btn btn-lg btn-block" type="submit" name="provider" value="github">
              <CodeIcon /> Continue with GitHub
            </button>
          </form>

          <p className={`inset ${styles.well}`}>
            <LockIcon />
            No password to create. New here? Signing in sets up your account.
          </p>
        </div>
        <p className={styles.terms}>By continuing you agree to the code of conduct.</p>
      </div>
    </main>
  );
}
