'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

/**
 * Refresh or navigate after a change, keeping the "Saving…" state on screen until the new page
 * data has arrived. State updates passed as `then` commit together with the fresh page, so a
 * button never flips back to its idle label while the old data is still showing.
 */
export function useRouterTransition() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return {
    /** True while the refreshed or new page is loading. */
    pending,
    refresh(then?: () => void) {
      startTransition(() => {
        then?.();
        router.refresh();
      });
    },
    push(href: string, then?: () => void) {
      startTransition(() => {
        then?.();
        router.push(href);
      });
    },
  };
}
