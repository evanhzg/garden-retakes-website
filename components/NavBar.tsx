"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ThemeToggle } from "./ThemeToggle";
import AvatarImage from "./AvatarImage";

type NavLink = {
  href: string;
  label: string;
  isSection?: boolean;
  isLive?: boolean;
  adminOnly?: boolean;
  /** Shown inline in the bar; everything else falls into the More menu. */
  primary?: boolean;
};

// Several routes existed with no way to reach them from the nav — /players,
// /pros, /compare, /docs, /request-skin and /settings were all reachable only by
// typing the URL or following a link from inside another page.
const CS2_LINKS: NavLink[] = [
  { href: "/", label: "Ladder", primary: true },
  { href: "/players", label: "Players", primary: true },
  { href: "/stats", label: "Stats", primary: true },
  { href: "/teams", label: "Teams", primary: true },
  { href: "/live", label: "Live", isLive: true, primary: true },
  { href: "/compare", label: "Compare" },
  { href: "/pros", label: "Pros" },
  { href: "/duels", label: "Duels" },
  { href: "/inventory", label: "Inventory" },
  { href: "/request-skin", label: "Request skin" },
  { href: "/docs", label: "Docs" },
  { href: "/commands", label: "Commands" },
  { href: "/roadmap", label: "Roadmap" },
  { href: "/games", label: "Games", isSection: true },
  { href: "/admin", label: "Admin", adminOnly: true },
];

const GAMES_LINKS: NavLink[] = [
  { href: "/games", label: "Games Hub", primary: true },
  { href: "/games/ladder", label: "Ladder", primary: true },
  { href: "/games/roadmap", label: "Roadmap" },
  { href: "/", label: "CS2", isSection: true },
];

type Session = {
  authenticated: boolean;
  name?: string | null;
  avatar?: string | null;
  steamId?: string | null;
  adminLevel?: number;
};

export default function NavBar({ 
  avatarPlayers = [], 
  host = "retakes.fr", 
  protocol = "https" 
}: { 
  avatarPlayers?: any[], 
  host?: string, 
  protocol?: string 
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<Session>({ authenticated: false });
  const [isLiveServer, setIsLiveServer] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  
  const headerRef = useRef<HTMLElement>(null);
  const [inGame, setInGame] = useState(false);
  const [headerHidden, setHeaderHidden] = useState(false);

  useEffect(() => {
    const sync = () => setInGame(document.body.classList.contains("in-game"));
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    try { setHeaderHidden(localStorage.getItem("garden_header_hidden") === "1"); } catch {}
  }, []);

  const collapsed = inGame && headerHidden;

  const setHidden = (v: boolean) => {
    setHeaderHidden(v);
    try { localStorage.setItem("garden_header_hidden", v ? "1" : "0"); } catch {}
  };

  useEffect(() => {
    const checkLive = async () => {
      try {
        const res = await fetch("/api/live");
        if (res.ok) {
          const json = await res.json();
          if (json.live && json.data?.Players?.length > 0) {
            setIsLiveServer(true);
            return;
          }
        }
        setIsLiveServer(false);
      } catch (e) {
        setIsLiveServer(false);
      }
    };
    checkLive();
    const iv = setInterval(checkLive, 10000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then(setSession)
      .catch(() => {});
  }, []);

  const isGamesSection = pathname.startsWith("/games");
  const baseLinks = isGamesSection ? [...GAMES_LINKS] : [...CS2_LINKS];
  
  if (isGamesSection) {
    baseLinks.push({ href: "/games/profile", label: "Profile" });
    if (session.authenticated) {
      baseLinks.push({ href: "/api/auth/logout", label: "Log out" });
    } else {
      baseLinks.push({ href: `/games/login?returnTo=${encodeURIComponent(pathname)}`, label: "Sign in" });
    }
  }
  
  const links = baseLinks.filter(l => !l.adminOnly || (session.adminLevel ?? 0) > 0);

  const getHref = (path: string) => {
    let cleanHost = host;
    if (cleanHost.startsWith("www.")) {
      cleanHost = cleanHost.substring(4);
    }
    const subdomain = cleanHost.split(".")[0];
    const isKnownSubdomain = ["games", "docs", "pkmn"].includes(subdomain);
    const baseHost = isKnownSubdomain ? cleanHost.substring(subdomain.length + 1) : cleanHost;
    const targetSubMatch = ["/games", "/docs", "/pkmn"].find(s => path === s || path.startsWith(`${s}/`));
    
    let targetHost = baseHost;
    let targetPath = path;

    if (targetSubMatch) {
      const sub = targetSubMatch.replace("/", "");
      targetHost = `${sub}.${baseHost}`;
      targetPath = path.substring(targetSubMatch.length) || "/";
    }

    if (targetHost === host || targetHost === cleanHost) {
      return targetPath;
    } else {
      return `${protocol}://${targetHost}${targetPath}`;
    }
  };

  if (collapsed) {
    return (
      <button
        type="button"
        className="header-peek"
        onClick={() => setHidden(false)}
        aria-label="Show header"
        title="Show header"
        style={{ zIndex: 9999 }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
    );
  }

  const primary = links.filter((l) => l.primary);
  const overflow = links.filter((l) => !l.primary);

  const linkStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 13,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    textDecoration: "none",
    color: active ? "var(--color-accent)" : "var(--color-text)",
    whiteSpace: "nowrap",
  });

  return (
    <header
      ref={headerRef}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "clamp(12px, 2vw, 28px)",
        padding: "22px clamp(20px, 5vw, 64px)",
        borderBottom: "2px solid var(--color-divider)",
        position: "sticky",
        top: 0,
        background: "var(--color-bg)",
        zIndex: 30,
      }}
    >
      {/* Wordmark. At rest it reads RETAKES; the accent E stretch it out to
          REEEEETAKES on hover, one letter at a time. */}
      <Link href={getHref("/")} className="wordmark" aria-label="REEEEETAKES">
        RE
        <span className="wordmark-ee" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="wordmark-e" style={{ transitionDelay: `${i * 45}ms` }}>
              E
            </span>
          ))}
        </span>
        TAKES
      </Link>

      <nav style={{ display: "flex", alignItems: "center", gap: "clamp(14px, 2.4vw, 36px)" }}>
        {primary.map((l) => {
          const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
          const live = l.isLive && isLiveServer;
          return (
            <Link
              key={l.href}
              href={getHref(l.href)}
              className="link-underline"
              style={{
                ...linkStyle(active),
                ...(live ? { color: "var(--color-accent-700)", display: "flex", alignItems: "center", gap: 6 } : null),
              }}
            >
              {live && <span className="live-dot" />}
              {l.label}
            </Link>
          );
        })}

        {overflow.length > 0 && (
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              style={{
                ...linkStyle(false),
                background: "none",
                border: 0,
                cursor: "pointer",
                font: "inherit",
                fontSize: 13,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: 0,
              }}
            >
              More
              <motion.svg
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                animate={{ rotate: menuOpen ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <path d="M6 9l6 6 6-6" />
              </motion.svg>
            </button>

            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    position: "absolute",
                    top: "calc(100% + 14px)",
                    right: 0,
                    display: "flex",
                    flexDirection: "column",
                    minWidth: 200,
                    padding: "var(--space-2)",
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-divider)",
                    boxShadow: "var(--shadow-lg)",
                    zIndex: 40,
                  }}
                >
                  {overflow.map((l) => {
                    const active = pathname.startsWith(l.href);
                    return (
                      <Link
                        key={l.href}
                        href={getHref(l.href)}
                        onClick={() => setMenuOpen(false)}
                        style={{
                          padding: "9px 12px",
                          fontSize: 13,
                          textDecoration: "none",
                          color: active ? "var(--color-accent)" : "var(--color-text)",
                          borderTop: l.isSection ? "1px solid var(--color-divider)" : undefined,
                          marginTop: l.isSection ? "var(--space-2)" : undefined,
                          paddingTop: l.isSection ? "var(--space-3)" : undefined,
                        }}
                      >
                        {l.label}
                      </Link>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <ThemeToggle />

        {session.authenticated ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {session.steamId && (
              <Link href={getHref("/profile")} title={session.name ?? "Profile"}>
                <AvatarImage
                  steamId={session.steamId}
                  src={session.avatar}
                  alt={session.name ?? "Profile"}
                  className="avatar avatar-sm"
                />
              </Link>
            )}
            <a className="btn btn-secondary" href="/api/auth/logout" style={{ fontSize: 12 }}>
              Log out
            </a>
          </div>
        ) : (
          <a
            className="btn btn-secondary"
            href={`/games/login?returnTo=${encodeURIComponent(pathname)}`}
            style={{ fontSize: 12 }}
          >
            Sign in
          </a>
        )}

        {inGame && (
          <button
            type="button"
            onClick={() => setHidden(true)}
            title="Hide header for a distraction-free game"
            className="btn btn-icon btn-secondary"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 15l6-6 6 6" />
            </svg>
          </button>
        )}
      </nav>
    </header>
  );
}
