import Link from 'next/link';

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      H<span className="x">X</span>
    </span>
  );
}

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="HackXperience by CIReN, home">
      <BrandMark />
      <span className="brand-name">
        <span>
          Hack<span className="x">X</span>perience
        </span>
        <small>by CIReN</small>
      </span>
    </Link>
  );
}

export function SiteHeader({
  signedIn,
  canOrganize = false,
  current,
  signInPrimary = false,
}: {
  signedIn: boolean;
  canOrganize?: boolean;
  /** Marks the matching nav link as the current page. */
  current?: 'events';
  /** The homepage makes Sign in its one solid button; elsewhere the page's own action is. */
  signInPrimary?: boolean;
}) {
  return (
    <div className="site-header-bar">
      <header className="container site-header">
        <Brand />
        <nav className="nav" aria-label="Main">
          <Link
            className="nav-link"
            href="/events"
            aria-current={current === 'events' ? 'page' : undefined}
          >
            Events
          </Link>
          <Link className="nav-link" href="/#how-to-participate">
            How to Participate
          </Link>
          {canOrganize ? (
            <Link className="nav-link" href="/organize">
              Organize
            </Link>
          ) : (
            <Link className="nav-link" href="/#for-organizers">
              For organizers
            </Link>
          )}
          {signedIn ? (
            <Link className="btn btn-sm" href="/profile">
              Profile
            </Link>
          ) : (
            <Link className={signInPrimary ? 'btn btn-primary' : 'btn'} href="/sign-in">
              Sign in
            </Link>
          )}
        </nav>
      </header>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-top">
          <div className="footer-brand">
            <span className="brand">
              <BrandMark />
              <strong>
                Hack<span className="x">X</span>perience
              </strong>
            </span>
            <p style={{ margin: 0 }}>
              The hackathon platform of the Campus Innovation and Research Network (CIReN).
            </p>
          </div>
          <div className="footer-columns">
            <nav aria-labelledby="footer-hx">
              <h2 id="footer-hx">HackXperience</h2>
              <ul>
                <li>
                  <Link href="/events">Events</Link>
                </li>
                <li>
                  <Link href="/#how-to-participate">How to Participate</Link>
                </li>
                <li>
                  <Link href="/#for-organizers">For organizers</Link>
                </li>
              </ul>
            </nav>
            <nav aria-labelledby="footer-ciren">
              <h2 id="footer-ciren">CIReN</h2>
              <ul>
                <li>
                  <a href="https://ciren.network">ciren.network</a>
                </li>
                <li>
                  <a href="mailto:admin.cirenet@gmail.com">Contact</a>
                </li>
              </ul>
            </nav>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Campus Innovation and Research Network.</span>
          <span>hack.ciren.network</span>
        </div>
      </div>
    </footer>
  );
}
