'use client';

import type { ReactNode } from 'react';
import { OPEN_ALERTS_EVENT } from './alerts-popup';

/** Opens the event alerts pop-up (R42), e.g. from "Coming soon" or the footer. */
export function OpenAlertsButton({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new Event(OPEN_ALERTS_EVENT))}
    >
      {children}
    </button>
  );
}
