"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/", label: "Ladder" },
  { href: "/stats", label: "Stats" },
  { href: "/compare", label: "Compare" },
  { href: "/teams", label: "CR Teams" },
  { href: "/duels", label: "Duels" },
  { href: "/seasons", label: "Seasons" },
  { href: "/inventory", label: "Inventory" },
  { href: "/commands", label: "Commands" },
  { href: "/roadmap", label: "Roadmap" },
];

type Session = {
  authenticated: boolean;
  name?: string | null;
  avatar?: string | null;
  steamId?: string | null;
  adminLevel?: number;
};

type AvatarPlayer = {
  steamId: string;
  name: string;
  avatarSrc: string;
};

export default function NavBar({ avatarPlayers = [] }: { avatarPlayers?: AvatarPlayer[] }) {
  const pathname = usePathname();
  const [session, setSession] = useState<Session>({ authenticated: false });
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Close menu when navigating
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMenuOpen]);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then(setSession)
      .catch(() => {});
  }, []);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      <header className="site-header">
        <Link href="/" className="logo">
          🌿 Garden Retakes
        </Link>
        <nav className="desktop-nav">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={isActive(l.href) ? "active" : ""}>
              {l.label}
            </Link>
          ))}
          {(session.adminLevel ?? 0) > 0 && (
            <Link href="/admin" className={isActive("/admin") ? "active" : ""}>
              Admin
            </Link>
          )}
        </nav>
        <div className="nav-account desktop-nav">
          {session.authenticated ? (
            <Link className="account-chip" href="/profile" title="Edit your profile">
              {session.avatar && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={session.avatar} alt="" />
              )}
              <span>{session.name ?? "Signed in"}</span>
            </Link>
          ) : (
            <a className="account-signin" href="/api/auth/steam/login">
              Sign in
            </a>
          )}
        </div>
        
        <button 
          className="burger-button mobile-only" 
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label="Toggle menu"
        >
          <div className={`burger-icon ${isMenuOpen ? "open" : ""}`}>
            <span></span>
            <span></span>
            <span></span>
          </div>
        </button>
      </header>

      {/* Full-page mobile menu overlay */}
      <div className={`mobile-menu-overlay ${isMenuOpen ? "open" : ""}`}>
        <div className="mobile-menu-content">
          <nav className="mobile-nav-links">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={isActive(l.href) ? "active" : ""}>
                {l.label}
              </Link>
            ))}
            {(session.adminLevel ?? 0) > 0 && (
              <Link href="/admin" className={isActive("/admin") ? "active" : ""}>
                Admin
              </Link>
            )}
          </nav>

          <div className="mobile-nav-account">
            {session.authenticated ? (
              <Link className="account-chip" href="/profile">
                {session.avatar && <img src={session.avatar} alt="" />}
                <span>{session.name ?? "Signed in"}</span>
              </Link>
            ) : (
              <a className="account-signin" href="/api/auth/steam/login">
                Sign in
              </a>
            )}
          </div>

          {avatarPlayers.length > 0 && (
            <div className="mobile-nav-players">
              <h3>Custom Avatars</h3>
              <div className="mobile-player-grid">
                {avatarPlayers.map((p) => (
                  <Link key={p.steamId} href={`/players/${p.steamId}`} title={p.name} className="mp-avatar">
                    <img src={p.avatarSrc} alt={p.name} />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
