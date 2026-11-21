'use client';

import NextLink, { useLinkStatus } from 'next/link';
import type { ComponentProps } from 'react';
import { PixelGrid } from './loading-state';

/** Shows the pixel grid inside the link that was clicked, until its page has loaded. */
function LinkPending() {
  const { pending } = useLinkStatus();
  return pending ? <PixelGrid /> : null;
}

/**
 * next/link with a loading state on the link itself: nothing else on the page changes while
 * the next page loads. Use it everywhere instead of next/link.
 */
export default function Link({ children, ...props }: ComponentProps<typeof NextLink>) {
  return (
    <NextLink {...props}>
      <LinkPending />
      {children}
    </NextLink>
  );
}
