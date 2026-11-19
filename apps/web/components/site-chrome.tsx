import Link from 'next/link';

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="HackXperience by CIReN, home">
      <span className="brand-mark" aria-hidden="true">
        H<span className="x">X</span>
      </span>
      <span className="brand-name">
        <span>
          Hack<span className="x">X</span>perience
        </span>
        <small>by CIReN</small>
      </span>
    </Link>
  );
}

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="container site-header">
      <Brand />
      <nav className="nav" aria-label="Main">
        <Link className="nav-link" href="/#how-it-works">
          How it works
        </Link>
        <Link className="nav-link" href="/#for-organizers">
          For organizers
        </Link>
        {signedIn ? (
          <Link className="btn" href="/profile">
            Profile
          </Link>
        ) : (
          <Link className="btn" href="/sign-in">
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="container">
      <div className="site-footer">
        <span>
          Hack<strong className="x">X</strong>perience by CIReN · hack.ciren.network
        </span>
        <nav aria-label="CIReN">
          <a href="https://ciren.network">ciren.network</a>
          <a href="mailto:admin.cirenet@gmail.com">admin.cirenet@gmail.com</a>
        </nav>
      </div>
    </footer>
  );
}
