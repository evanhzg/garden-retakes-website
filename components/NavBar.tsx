"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ThemeToggle } from "./ThemeToggle";

type NavLink = {
  href: string;
  label: string;
  isSection?: boolean;
  isLive?: boolean;
  adminOnly?: boolean;
};

// Several routes existed with no way to reach them from the nav — /players,
// /pros, /compare, /docs, /request-skin and /settings were all reachable only by
// typing the URL or following a link from inside another page.
const CS2_LINKS: NavLink[] = [
  { href: "/", label: "Ladder" },
  { href: "/players", label: "Players" },
  { href: "/stats", label: "Stats" },
  { href: "/compare", label: "Compare" },
  { href: "/teams", label: "CR Teams" },
  { href: "/pros", label: "Pros" },
  { href: "/duels", label: "Duels" },
  { href: "/live", label: "LIVE", isLive: true },
  { href: "/inventory", label: "Inventory" },
  { href: "/request-skin", label: "Request skin" },
  { href: "/docs", label: "Docs" },
  { href: "/commands", label: "Commands" },
  { href: "/roadmap", label: "Roadmap" },
  { href: "/games", label: "Games", isSection: true },
  { href: "/admin", label: "Admin", adminOnly: true },
];

const GAMES_LINKS: NavLink[] = [
  { href: "/", label: "CS2", isSection: true },
  { href: "/games", label: "Games Hub" },
  { href: "/games/roadmap", label: "Games Roadmap" },
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

  return (
    <>
      <header 
        ref={headerRef} 
        style={{
          position: 'fixed',
          top: '20px',
          left: '24px',
          right: '24px',
          zIndex: 50,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          pointerEvents: 'none'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', pointerEvents: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Link 
              href={getHref("/")} 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '8px 16px',
                background: 'color-mix(in srgb, var(--panel) 40%, transparent)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid color-mix(in srgb, var(--border) 20%, transparent)',
                borderRadius: '999px',
                boxShadow: 'var(--shadow)',
                color: 'var(--text)',
                textDecoration: 'none'
              }}
            >
              <img src="/retakes_logo.png" alt="Logo" style={{ width: '24px', height: '24px', objectFit: 'contain' }} />
              <span style={{ fontWeight: 800, letterSpacing: '2px', fontSize: '13px' }}>REEEETAKES</span>
            </Link>
            
            <button 
              onClick={() => setMenuOpen(!menuOpen)}
              style={{
                width: '42px',
                height: '42px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '5px',
                background: 'color-mix(in srgb, var(--panel) 40%, transparent)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid color-mix(in srgb, var(--border) 20%, transparent)',
                borderRadius: '50%',
                cursor: 'pointer',
                color: 'var(--text)',
                boxShadow: 'var(--shadow)'
              }}
            >
              <motion.span animate={menuOpen ? { rotate: 45, y: 7 } : { rotate: 0, y: 0 }} style={{ width: '16px', height: '2px', background: 'currentColor', borderRadius: '2px' }} />
              <motion.span animate={menuOpen ? { opacity: 0 } : { opacity: 1 }} style={{ width: '16px', height: '2px', background: 'currentColor', borderRadius: '2px' }} />
              <motion.span animate={menuOpen ? { rotate: -45, y: -7 } : { rotate: 0, y: 0 }} style={{ width: '16px', height: '2px', background: 'currentColor', borderRadius: '2px' }} />
            </button>
          </div>

          <AnimatePresence>
            {menuOpen && (
              <motion.nav 
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  background: 'color-mix(in srgb, var(--panel) 70%, transparent)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  border: '1px solid var(--border)',
                  borderRadius: '20px',
                  padding: '12px',
                  boxShadow: 'var(--shadow-hover)',
                  width: '240px',
                  gap: '4px'
                }}
              >
                {links.map(l => {
                  const isActive = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
                  return (
                    <Link
                      key={l.href}
                      href={getHref(l.href)}
                      onClick={() => setMenuOpen(false)}
                      style={{
                        position: 'relative',
                        padding: '10px 16px',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        textDecoration: 'none',
                        color: isActive ? 'var(--accent)' : 'var(--text)',
                        background: isActive ? 'var(--accent-soft)' : 'transparent',
                        fontWeight: isActive ? 700 : 500,
                        fontSize: '14px',
                        transition: 'background 0.2s, color 0.2s'
                      }}
                    >
                      <span>{l.label}</span>
                      {l.isLive && isLiveServer && (
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
                      )}
                    </Link>
                  );
                })}
              </motion.nav>
            )}
          </AnimatePresence>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', pointerEvents: 'auto' }}>
          <div style={{
            background: 'color-mix(in srgb, var(--panel) 40%, transparent)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid color-mix(in srgb, var(--border) 20%, transparent)',
            borderRadius: '999px',
            display: 'flex',
            alignItems: 'center',
            padding: '4px',
            boxShadow: 'var(--shadow)'
          }}>
            <ThemeToggle />
          </div>

          <div style={{
            background: 'color-mix(in srgb, var(--panel) 40%, transparent)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid color-mix(in srgb, var(--border) 20%, transparent)',
            borderRadius: '999px',
            overflow: 'hidden',
            boxShadow: 'var(--shadow)',
            display: 'flex'
          }}>
            {session.authenticated ? (
              <Link 
                href={getHref("/profile")} 
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px 6px 6px', textDecoration: 'none', color: 'var(--text)' }}
              >
                {session.avatar && <img src={session.avatar} alt="Avatar" style={{ width: '28px', height: '28px', borderRadius: '50%' }} />}
                <span style={{ fontSize: '13px', fontWeight: 600 }}>{session.name ?? "Profile"}</span>
              </Link>
            ) : (
              <a 
                href={`/api/auth/steam/login?returnTo=${encodeURIComponent(pathname)}`} 
                style={{ padding: '10px 20px', fontSize: '13px', fontWeight: 600, textDecoration: 'none', color: 'var(--text)' }}
              >
                Sign In
              </a>
            )}
          </div>

          {inGame && (
            <button
              type="button"
              onClick={() => setHidden(true)}
              title="Hide header for a distraction-free game"
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'color-mix(in srgb, var(--panel) 40%, transparent)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid color-mix(in srgb, var(--border) 20%, transparent)',
                color: 'var(--text)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 15l6-6 6 6" />
              </svg>
            </button>
          )}
        </div>
      </header>
    </>
  );
}
