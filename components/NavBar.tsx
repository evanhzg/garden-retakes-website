"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ThemeToggle } from "./ThemeToggle";
import AvatarImage from "./AvatarImage";
import AvatarMenu from "./AvatarMenu";
import NotificationCenter from "@/components/NotificationCenter";
import { useI18n } from "@/components/I18nProvider";
import {
  BarChart3,
  Crosshair,
  Flame,
  GitCompare,
  HeartHandshake,
  LineChart,
  Map,
  MessagesSquare,
  Palette,
  Radio,
  Rss,
  Shield,
  Swords,
  Terminal,
  Trophy,
  MoreHorizontal,
  LogIn,
  User,
  Settings,
  Server,
  Gauge,
  type LucideIcon,
} from "lucide-react";
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
  /** The rail is 64px wide, so every primary link needs a glyph. */
  icon?: LucideIcon;
  /** Built, linked, and not finished. Rendered dimmed and still clickable —
      the page it lands on says so itself. */
  soon?: boolean;
};

// /players, /pros and /teams are deliberately absent: the ladder, stats tables
// and search all link straight into /players/[steamId], so a top-level entry
// duplicated a journey people were already taking — and /teams and /pros were
// thin enough that surfacing them cost more attention than they returned. The
// routes still exist and still resolve.
const CS2_LINKS: NavLink[] = [
  { href: "/insights", label: "Insights", key: "nav.insights", primary: true, icon: LineChart },
  { href: "/stats", label: "Stats", key: "nav.stats", primary: true, icon: BarChart3 },
  // Inventory and Admin are not here any more: both are account destinations
  // rather than places on the site, so they live in the avatar menu with
  // Profile and Settings. See components/AvatarMenu.tsx.
  // The old homepage. Moved off "/" when the tournament system took that slot,
  // and linked here so it is not orphaned at a URL nobody would guess.
  { href: "/community", label: "Community", key: "nav.community", primary: true, icon: MessagesSquare },
  { href: "/feed", label: "Feed", key: "nav.feed", primary: true, icon: Rss },
  { href: "/utility", label: "Utility", key: "nav.utility", primary: true, icon: Flame },
  { href: "/live", label: "Live", key: "nav.live", isLive: true, primary: true, icon: Radio },
  { href: "/lobby", label: "Matchmaking", key: "nav.lobby", primary: true, icon: Swords },
  // Tournaments and Matchmaking are both in the demo allowlist further down. A
  // demo is shown to somebody being pitched an event, and those two are the
  // event and the way into it. (This used to say "deliberately absent from
  // hiddenInDemo", which stopped being true when the blocklist became an
  // allowlist — a comment naming a thing that no longer exists is worse than
  // none, because it is read as current.)
  // Not primary any more: the right rail lists tournaments, and it separates
  // the ones you run from the ones you are playing in — which is more than a
  // link to the directory ever said. It stays in More and in the phone drawer.
  { href: "/tournaments", label: "Tournaments", key: "nav.tournaments", icon: Trophy },
  // Standing teams, and the Blitz ladder under them. Primary because a team is
  // the unit a tournament is entered as now, so "where is my team" is a
  // question with an answer worth reaching in one click.
  { href: "/teams", label: "Teams", key: "nav.teams", primary: true, icon: Shield },
  { href: "/safe-place", label: "Safe Place", key: "nav.safe_place", primary: true, icon: HeartHandshake },
  { href: "/compare", label: "Compare", key: "nav.compare", icon: GitCompare },
  { href: "/duels", label: "Duels", key: "nav.duels", primary: true, soon: true, icon: Crosshair },
  { href: "/request-skin", label: "Request skin", key: "nav.requestSkin", icon: Palette },
  { href: "/commands", label: "Commands", key: "nav.commands", icon: Terminal },
  { href: "/roadmap", label: "Roadmap", key: "nav.roadmap", icon: Map },
];


type Session = {
  authenticated: boolean;
  name?: string | null;
  avatar?: string | null;
  steamId?: string | null;
  adminLevel?: number;
  /** Runs events. A separate grant from adminLevel — see staffLinks. */
  isOrganizer?: boolean;
};

export default function NavBar({ 
  avatarPlayers = [], 
  host = "retakes.fr", 
  protocol = "https",
  isDemoMode = false
}: { 
  avatarPlayers?: any[], 
  host?: string, 
  protocol?: string,
  isDemoMode?: boolean
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

  // One nav. There used to be a second one for /games, which moved out to
  // ~/projects/garden-games along with /docs and /pkmn — see their READMEs.
  // Nothing in the site links to those paths any more, so nothing needs to
  // switch between two sets of links.
  const isGamesSection = false;

  let baseLinks = [...CS2_LINKS];
  if (isDemoMode) {
    // An allowlist, not a blocklist. The blocklist that used to be here named
    // ten routes to hide, so every route added afterwards appeared in the demo
    // by default — the opposite of what a demo is for. Naming the two that stay
    // means a new page is invisible until somebody decides otherwise.
    //
    // Tournaments is the pitch; Stats is here for tournament stats only, which
    // is enforced on the page itself rather than by hiding the link.
    //
    // Matchmaking joined them because the pitch was only half of one without it.
    // A demo that shows a bracket and no way to play the mode leaves the obvious
    // question — "yes, but can I try it" — with no answer on screen. The lobby
    // is that answer, and it runs the same roles-then-veto-then-server flow a
    // tournament match does, so it demonstrates the product rather than a
    // separate corner of it.
    const shownInDemo = ["/tournaments", "/stats", "/lobby"];
    baseLinks = baseLinks.filter((l) => shownInDemo.includes(l.href));
  }
  
  const links = baseLinks.filter(l => !l.adminOnly || (session.adminLevel ?? 0) > 0);

  /**
   * A link, as typed.
   *
   * This used to rewrite /games, /docs and /pkmn onto their own subdomains,
   * and rewrite back off them when the site was served from one. Those three
   * sections left for ~/projects and nothing links to those paths any more,
   * so every branch of it was dead — and dead host-rewriting is the kind of
   * thing that silently sends somebody to a hostname that does not resolve.
   *
   * When the standalone sites exist they are external URLs, which belong in
   * the link list as absolute hrefs rather than as a rule inferred from a
   * path.
   */
  const getHref = (path: string) => path;

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

  /**
   * The staff shortcuts, which are two separate grants and not one.
   *
   * A site admin gets the server panel. An ORGANIZER gets the Blitz panel —
   * and an organizer may have no admin level at all, which is exactly why this
   * cannot be a single `adminLevel > 0` check with both links behind it. That
   * mistake shows up as an organizer who runs events being unable to see the
   * panel for running them.
   *
   * Labels are literal rather than translated: both panels are named the same
   * in every language on the site already (adminSections.ts), and inventing
   * two keys for two words that never change is a dictionary entry nobody
   * maintains.
   */
  const isAdmin = (session.adminLevel ?? 0) > 0;
  const staffLinks: { href: string; label: string; icon: LucideIcon }[] = [
    ...(isAdmin ? [{ href: "/admin", label: "Server & community", icon: Server }] : []),
    ...(isAdmin || session.isOrganizer
      ? [{ href: "/admin/blitz", label: "Blitz", icon: Gauge }]
      : []),
  ];

  return (
    <>
    {/* The site's navigation, down the left edge.

        It was a sticky bar across the top, and the top of the page is the one
        strip every piece of content also wants. A column costs 64px of width
        on a screen that has width to spare and gives the whole height back —
        and it puts the site nav and the social nav on opposite edges, framing
        the content rather than pushing it down.

        Icons with tooltips, because a 64px column has room for a glyph and not
        a word. Every one of them is in the phone drawer as text, so nothing is
        reachable only by recognising a picture. */}
    <nav
      ref={headerRef as React.RefObject<HTMLElement>}
      className="site-rail"
      aria-label={t("auto.navbar.reeeeetakes")}
    >
      {/* The mark. Short here — the full REEEETAKES stretch needs a line of
          text to stretch along, and this column has none. */}
      <Link href={getHref("/")} className="site-rail-mark" aria-label={t("auto.navbar.reeeeetakes")}>
        R
      </Link>

      <div className="site-rail-links">
        {primary.map((l) => {
          const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
          const live = l.isLive && isLiveServer;
          const Icon = l.icon;

          return (
            <Link
              key={l.href}
              href={getHref(l.href)}
              className={`site-rail-btn ${active ? "active" : ""} ${l.soon ? "is-soon" : ""}`}
              title={l.soon ? `${tr(l)} — ${t("nav.comingSoon")}` : tr(l)}
              aria-label={tr(l)}
              aria-current={active ? "page" : undefined}
            >
              {Icon ? <Icon size={18} /> : <span className="site-rail-initial">{tr(l).slice(0, 1)}</span>}
              {live && <span className="live-dot site-rail-live" aria-hidden />}
              {l.soon && <span className="site-rail-soon-dot" aria-hidden />}
            </Link>
          );
        })}

        {overflow.length > 0 && (
          <div ref={moreRef} className="site-rail-more">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className={`site-rail-btn ${menuOpen ? "active" : ""}`}
              title={t("nav.more")}
              aria-label={t("nav.more")}
            >
              <MoreHorizontal size={18} />
            </button>

            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  role="menu"
                  // Out of the button's own edge, which is now the right one:
                  // the rail is against the left of the screen and there is
                  // nowhere left to grow into.
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6, transition: { duration: 0.12 } }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="site-rail-menu"
                >
                  {overflow.map((l) => {
                    const active = pathname.startsWith(l.href);
                    const Icon = l.icon;
                    return (
                      <Link
                        key={l.href}
                        href={getHref(l.href)}
                        onClick={() => setMenuOpen(false)}
                        className="site-rail-menu-item"
                        data-section={l.isSection ? "true" : undefined}
                        style={{ color: active ? "var(--color-accent)" : undefined }}
                      >
                        {Icon && <Icon size={14} />}
                        <span>{tr(l)}</span>
                      </Link>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Staff, behind a rule of its own.

          These are a different KIND of destination. /stats is a place on the
          site; /admin is a place you go to CHANGE the site, and dropping the
          two into one column of glyphs is how somebody ends up one mis-click
          from a panel they meant to scroll past. The rule and the gap are the
          whole point of the group.

          The two panels are separate grants and are drawn separately: Blitz is
          the one an organizer with no admin level at all can open, so it must
          never appear only because the site panel did. */}
      {(staffLinks.length > 0) && (
        <div className="site-rail-group">
          {staffLinks.map((l) => {
            const active = pathname.startsWith(l.href);
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={getHref(l.href)}
                className={`site-rail-btn is-staff ${active ? "active" : ""}`}
                title={l.label}
                aria-label={l.label}
                aria-current={active ? "page" : undefined}
              >
                {Icon && <Icon size={18} />}
              </Link>
            );
          })}
        </div>
      )}

      {/* Account, at the bottom. The things that are about YOU rather than
          about the site, kept away from the places you go.

          Profile and Settings are on the rail rather than only inside the
          avatar menu: they were a hover and a read away, for the two
          destinations people reach for most after the ones above. */}
      <div className="site-rail-foot">
        {session.authenticated && (
          <div className="site-rail-group">
            <Link
              href={getHref("/profile")}
              className={`site-rail-btn ${pathname.startsWith("/profile") ? "active" : ""}`}
              title={t("nav.profile")}
              aria-label={t("nav.profile")}
            >
              <User size={18} />
            </Link>
            <Link
              href={getHref("/settings")}
              className={`site-rail-btn ${pathname.startsWith("/settings") ? "active" : ""}`}
              title={t("nav.settings")}
              aria-label={t("nav.settings")}
            >
              <Settings size={18} />
            </Link>
          </div>
        )}

        <NotificationCenter steamId={session.steamId} />

        {session.authenticated ? (
          <div className="nav-identity">
            <AvatarMenu
              steamId={session.steamId}
              name={session.name}
              avatar={session.avatar}
              adminLevel={session.adminLevel ?? 0}
              getHref={getHref}
            />
          </div>
        ) : (
          <a
            className="site-rail-btn"
            title={t("nav.signIn")}
            aria-label={t("nav.signIn")}
            href={
              isGamesSection
                ? `/games/login?returnTo=${encodeURIComponent(pathname)}`
                : `/api/auth/steam/login?returnTo=${encodeURIComponent(pathname)}`
            }
          >
            <LogIn size={18} />
          </a>
        )}
      </div>
    </nav>

    {/* The phone's way in. The rail is display:none below 760px — a column
        down the side of a phone is width a phone does not have — and this
        opens the same drawer the burger in the old header opened. */}
    <button
      type="button"
      className="nav-burger-fab"
      aria-expanded={drawerOpen}
      aria-controls="nav-drawer"
      aria-label={drawerOpen ? "Close menu" : "Open menu"}
      onClick={() => setDrawerOpen((v) => !v)}
    >
      <span className={`nav-burger-box ${drawerOpen ? "open" : ""}`} aria-hidden>
        <span /><span /><span />
      </span>
    </button>

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
    <GlobalMatchmaking avatarPlayers={avatarPlayers} />
    </>
  );
}
