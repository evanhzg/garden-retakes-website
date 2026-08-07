"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ThemeToggle } from "./ThemeToggle";
import AvatarImage from "./AvatarImage";
import NotificationCenter from "@/components/NotificationCenter";
import { useI18n } from "@/components/I18nProvider";
import GlobalMatchmaking from "./retakes/GlobalMatchmaking";

type NavLink = {
  href: string;
  label: string;
  /** Translation key; the label is the English fallback. */
  key?: string;
  isSection?: boolean;
  isLive?: boolean;
  adminOnly?: boolean;
  /** Shown inline in the bar; everything else falls into the More menu. */
  primary?: boolean;
};

// /players, /pros and /teams are deliberately absent: the ladder, stats tables
// and search all link straight into /players/[steamId], so a top-level entry
// duplicated a journey people were already taking — and /teams and /pros were
// thin enough that surfacing them cost more attention than they returned. The
// routes still exist and still resolve.
const CS2_LINKS: NavLink[] = [
  { href: "/", label: "Ladder", key: "nav.ladder", primary: true },
  { href: "/insights", label: "Insights", key: "nav.insights", primary: true },
  { href: "/stats", label: "Stats", key: "nav.stats", primary: true },
  { href: "/inventory", label: "Inventory", key: "nav.inventory", primary: true },
  { href: "/feed", label: "Feed", key: "nav.feed", primary: true },
  { href: "/utility", label: "Utility", key: "nav.utility", primary: true },
  { href: "/live", label: "Live", key: "nav.live", isLive: true, primary: true },
  { href: "/compare", label: "Compare" },
  { href: "/duels", label: "Duels" },
  { href: "/request-skin", label: "Request skin" },
  { href: "/docs", label: "Docs" },
  { href: "/commands", label: "Commands" },
  { href: "/roadmap", label: "Roadmap" },
  { href: "/games", label: "Games", key: "nav.games", isSection: true },
  { href: "/admin", label: "Admin", key: "nav.admin", adminOnly: true },
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
  const { t } = useI18n();
  /** A link's label in the current language, falling back to its English. */
  const tr = (l: { label: string; key?: string }) => (l.key ? t(l.key) : l.label);
  const [menuOpen, setMenuOpen] = useState(false);
  /** The phone drawer. Every link lives in it, not just the overflow ones. */
  const [drawerOpen, setDrawerOpen] = useState(false);
  
  const headerRef = useRef<HTMLElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const [inGame, setInGame] = useState(false);
  const [headerHidden, setHeaderHidden] = useState(false);

  // The More menu had no way out but clicking More again — every other menu on
  // the site closes on an outside click, and this one stayed open while you
  // went off to use something else.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    // .main-content is the scroll container, so locking <body> would do nothing.
    const scroller = document.querySelector<HTMLElement>(".main-content");
    const previous = scroller?.style.overflow ?? "";
    if (scroller) scroller.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      if (scroller) scroller.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    // Capture, so a menu item's own click still runs before this closes it.
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

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
        aria-label={t("auto.navbar.show_header")}
        title={t("auto.navbar.show_header")}
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
    <>
    <header
      ref={headerRef}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "clamp(12px, 2vw, 28px)",
        padding: "22px var(--page-pad)",
        borderBottom: "2px solid var(--color-divider)",
        position: "sticky",
        top: 0,
        background: "var(--color-bg)",
        zIndex: 30,
      }}
    >
      {/* Wordmark. At rest it reads RETAKES; the accent E stretch it out to
          REEEEETAKES on hover, one letter at a time. */}
      <Link href={getHref("/")} className="wordmark" aria-label={t("auto.navbar.reeeeetakes")}>
        {t("auto.navbar.re")}
                      <span className="wordmark-ee" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="wordmark-e"
              style={{ ["--e-delay" as string]: `${i * 55}ms` }}
            >
              E
            </span>
          ))}
        </span>
        {t("auto.navbar.takes")}
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
              {tr(l)}
            </Link>
          );
        })}

        {overflow.length > 0 && (
          <div ref={moreRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
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
              {t("nav.more")}
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
                  role="menu"
                  // Grows out of the button it belongs to rather than sliding in
                  // from nowhere: the corner it scales from is the corner the
                  // button is in.
                  initial={{ opacity: 0, scaleY: 0.86, y: -8 }}
                  animate={{ opacity: 1, scaleY: 1, y: 0 }}
                  exit={{ opacity: 0, scaleY: 0.9, y: -6, transition: { duration: 0.12 } }}
                  transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    transformOrigin: "top right",
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
                  {overflow.map((l, i) => {
                    const active = pathname.startsWith(l.href);
                    return (
                      <motion.div
                        key={l.href}
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2, delay: 0.03 + i * 0.022, ease: [0.16, 1, 0.3, 1] }}
                        style={{ display: "flex" }}
                      >
                      <Link
                        href={getHref(l.href)}
                        onClick={() => setMenuOpen(false)}
                        className="nav-more-item"
                        data-section={l.isSection ? "true" : undefined}
                        style={{
                          flex: 1,
                          padding: "9px 12px",
                          fontSize: 13,
                          textDecoration: "none",
                          color: active ? "var(--color-accent)" : "var(--color-text)",
                        }}
                      >
                        {tr(l)}
                      </Link>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <button
          type="button"
          className="nav-burger"
          aria-expanded={drawerOpen}
          aria-controls="nav-drawer"
          aria-label={drawerOpen ? "Close menu" : "Open menu"}
          onClick={() => setDrawerOpen((v) => !v)}
        >
          <span className={`nav-burger-box ${drawerOpen ? "open" : ""}`} aria-hidden>
            <span /><span /><span />
          </span>
        </button>

        <NotificationCenter />

        {session.authenticated ? (
          <div className="nav-identity" style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
              {t("auto.navbar.log_out")}
                                      </a>
          </div>
        ) : (
          // The CS2 side signs in with Steam and comes back where you were.
          // This button pointed at /games/login regardless of which side of the
          // site you were on, so it crossed to the games subdomain and landed
          // on its default page instead of the one you left.
          <a
            className="btn btn-secondary nav-identity"
            href={
              isGamesSection
                ? `/games/login?returnTo=${encodeURIComponent(pathname)}`
                : `/api/auth/steam/login?returnTo=${encodeURIComponent(pathname)}`
            }
            style={{ fontSize: 12 }}
          >
            {t("nav.signIn")}
          </a>
        )}

        {inGame && (
          <button
            type="button"
            onClick={() => setHidden(true)}
            title={t("auto.navbar.hide_header_for_a_distraction")}
            className="btn btn-icon btn-secondary"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 15l6-6 6 6" />
            </svg>
          </button>
        )}
      </nav>

      {/* The phone menu. Every link is in here — primary and overflow both —
          because a burger that only holds half the site is worse than none:
          you cannot tell which half you are missing. */}
      {drawerOpen && (
        <div className="nav-drawer-scrim" onClick={() => setDrawerOpen(false)} aria-hidden />
      )}
      <div id="nav-drawer" className={`nav-drawer ${drawerOpen ? "open" : ""}`} role="dialog" aria-modal="true" aria-label={t("nav.more")}>
        <div className="nav-drawer-inner">
          {session.authenticated && session.steamId && (
            <Link
              href={getHref("/profile")}
              className="nav-drawer-me"
              onClick={() => setDrawerOpen(false)}
            >
              <AvatarImage
                steamId={session.steamId}
                src={session.avatar}
                alt=""
                className="avatar avatar-lg"
              />
              <span className="nav-drawer-me-text">
                <span className="nav-drawer-me-name">{session.name ?? t("nav.profile")}</span>
                <span className="nav-drawer-me-sub">{t("nav.profile")}</span>
              </span>
            </Link>
          )}

          {links.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={getHref(l.href)}
                className={`nav-drawer-item ${active ? "active" : ""}`}
                data-section={l.isSection ? "true" : undefined}
                onClick={() => setDrawerOpen(false)}
              >
                {tr(l)}
                {l.isLive && isLiveServer && <span className="live-dot" aria-hidden />}
              </Link>
            );
          })}

          <div className="nav-drawer-foot">
            {session.authenticated ? (
              <a className="btn btn-secondary" href="/api/auth/logout">{t("nav.signOut")}</a>
            ) : (
              <a
                className="btn btn-primary"
                href={
                  isGamesSection
                    ? `/games/login?returnTo=${encodeURIComponent(pathname)}`
                    : `/api/auth/steam/login?returnTo=${encodeURIComponent(pathname)}`
                }
              >
                {t("nav.signIn")}
              </a>
            )}
          </div>
        </div>
      </div>
    </header>
    <GlobalMatchmaking />
    </>
  );
}
