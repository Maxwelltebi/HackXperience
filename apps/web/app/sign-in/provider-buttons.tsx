'use client';

import { useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { CodeIcon, MailIcon } from '@/components/icons';
import { Busy } from '@/components/loading-state';

type Provider = 'google' | 'github';

const PROVIDERS: { id: Provider; name: string; icon: ReactNode }[] = [
  { id: 'google', name: 'Google', icon: <MailIcon /> },
  { id: 'github', name: 'GitHub', icon: <CodeIcon /> },
];

/** The two sign-in buttons. While the redirect starts, the chosen one says so and both lock. */
export function ProviderButtons() {
  const { pending } = useFormStatus();
  const [chosen, setChosen] = useState<Provider | null>(null);
  return (
    <>
      {PROVIDERS.map((provider) => (
        <button
          key={provider.id}
          className="btn btn-lg btn-block"
          type="submit"
          name="provider"
          value={provider.id}
          aria-disabled={pending}
          onClick={(event) => {
            // Disabling the button would drop its value from the form, so block repeat clicks here.
            if (pending) event.preventDefault();
            else setChosen(provider.id);
          }}
        >
          {pending && chosen === provider.id ? (
            <Busy>{`Opening ${provider.name}…`}</Busy>
          ) : (
            <>
              {provider.icon} Continue with {provider.name}
            </>
          )}
        </button>
      ))}
    </>
  );
}
