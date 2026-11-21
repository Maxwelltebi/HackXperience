import { LoadingState } from './loading-state';
import { Brand } from './site-chrome';

/** Placeholders for the `loading.tsx` files: the page's frame with the loader in the middle. */

/** The site header without the signed-in parts, which aren't known yet. */
function HeaderFrame() {
  return (
    <div className="site-header-bar">
      <div className="container site-header">
        <Brand />
      </div>
    </div>
  );
}

/** A public or participant page: the header, then the loader. */
export function PageLoading({ label }: { label: string }) {
  return (
    <>
      <HeaderFrame />
      <main className="container loading-region" aria-busy="true">
        <LoadingState label={label} />
      </main>
    </>
  );
}

/** An organizer page, inside the sidebar shell. */
export function OrganizerLoading({ label }: { label: string }) {
  return (
    <div className="loading-region" aria-busy="true">
      <LoadingState label={label} />
    </div>
  );
}

/** The full-screen ticket. */
export function TicketLoading() {
  return (
    <main className="loading-region loading-region-full" aria-busy="true">
      <LoadingState label="Loading your ticket" />
    </main>
  );
}
