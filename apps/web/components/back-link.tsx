import Link from './link';
import { ArrowLeftIcon } from './icons';

/** A back arrow to the page this one belongs to, above the page title. */
export function BackLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className="back-link">
      <ArrowLeftIcon width={16} height={16} />
      {children}
    </Link>
  );
}
