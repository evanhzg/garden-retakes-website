"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/", label: "Ladder" },
  { href: "/compare", label: "Compare" },
  { href: "/teams", label: "CR Teams" },
  { href: "/seasons", label: "Seasons" },
  { href: "/inventory", label: "Inventory" },
  { href: "/commands", label: "Commands" },
  { href: "/roadmap", label: "Roadmap" },
];

type Session = { authenticated: boolean; name?: string | null; avatar?: string | null };

export default function NavBar() {
  const pathname = usePathname();
  const [session, setSession] = useState<Session>({ authenticated: false });

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then(setSession)
      .catch(() => {});
  }, []);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="site-header">
      <Link href="/" className="logo">
        🌿 Garden Retakes
      </Link>
      <nav>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={isActive(l.href) ? "active" : ""}>
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="nav-account">
        {session.authenticated ? (
          <span className="account-chip">
            {session.avatar && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.avatar} alt="" />
            )}
            <span>{session.name ?? "Signed in"}</span>
          </span>
        ) : (
          <a className="account-signin" href="/api/auth/steam/login">
            Sign in
          </a>
        )}
      </div>
    </header>
  );
}
