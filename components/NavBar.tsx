"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { ThemeToggle } from "./ThemeToggle";

type NavLink = {
  href: string;
  label: string;
  isSection?: boolean;
  isLive?: boolean;
  adminOnly?: boolean;
};

const CS2_LINKS: NavLink[] = [
  { href: "/", label: "Ladder" },
  { href: "/stats", label: "Stats" },
  { href: "/teams", label: "CR Teams" },
  { href: "/duels", label: "Duels" },
  { href: "/live", label: "LIVE", isLive: true },
  { href: "/inventory", label: "Inventory" },
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

type AvatarPlayer = {
  steamId: string;
  name: string;
  avatarSrc: string;
};

export default function NavBar({ 
  avatarPlayers = [], 
  host = "retakes.fr", 
  protocol = "https" 
}: { 
  avatarPlayers?: AvatarPlayer[], 
  host?: string, 
  protocol?: string 
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<Session>({ authenticated: false });
  const [isLiveServer, setIsLiveServer] = useState(false);

  // Wheel state
  const [scrollIndex, setScrollIndex] = useState(0);
  const wheelRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number | null>(null);
  const [showWheel, setShowWheel] = useState(false);

  // Distraction-free header: while a game owns the screen (body.in-game), the
  // header can be collapsed out of the way. The boards reserve the header's
  // height via --games-top-inset, which we own here and zero out when hidden.
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

  // Publish the header's live height so the boards can sit exactly beneath it —
  // 0 while collapsed so they reclaim the full screen.
  useEffect(() => {
    const el = headerRef.current;
    const root = document.documentElement;
    const apply = () => {
      const h = el ? Math.round(el.getBoundingClientRect().height) : 0;
      root.style.setProperty("--games-top-inset", collapsed ? "0px" : `${h}px`);
    };
    apply();
    const ro = el && typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
    if (ro && el) ro.observe(el);
    window.addEventListener("resize", apply);
    return () => { window.removeEventListener("resize", apply); ro?.disconnect(); };
  }, [collapsed]);

  // Let the friends button (rendered elsewhere) know to step aside when hidden.
  useEffect(() => {
    document.body.classList.toggle("header-hidden", collapsed);
    return () => document.body.classList.remove("header-hidden");
  }, [collapsed]);

  const isGamesSection = pathname.startsWith("/games");
  const baseLinks = isGamesSection ? GAMES_LINKS : CS2_LINKS;
  const links = baseLinks.filter(l => !l.adminOnly || (session.adminLevel ?? 0) > 0);

  const getHref = (path: string) => {
    const subdomain = host.split(".")[0];
    const isKnownSubdomain = ["games", "docs", "pkmn"].includes(subdomain);
    const baseHost = isKnownSubdomain ? host.substring(subdomain.length + 1) : host;

    const targetSubMatch = ["/games", "/docs", "/pkmn"].find(s => path === s || path.startsWith(`${s}/`));
    
    let targetHost = baseHost;
    let targetPath = path;

    if (targetSubMatch) {
      const sub = targetSubMatch.replace("/", "");
      targetHost = `${sub}.${baseHost}`;
      targetPath = path.substring(targetSubMatch.length) || "/";
    }

    if (targetHost === host) {
      return targetPath;
    } else {
      return `${protocol}://${targetHost}${targetPath}`;
    }
  };

  // Find center index (index of /live for CS2, or middle for games)
  const defaultCenterIdx = isGamesSection ? Math.floor(links.length / 2) : links.findIndex(l => l.href === "/live");
  const actualCenterIdx = defaultCenterIdx >= 0 ? defaultCenterIdx : Math.floor(links.length / 2);

  useEffect(() => {
    // Check if server is live
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

  // Set initial scroll index to the active route, or center if not found
  useEffect(() => {
    const idx = links.findIndex(l => l.href === "/" ? pathname === "/" : pathname.startsWith(l.href));
    if (idx !== -1) {
      setScrollIndex(actualCenterIdx - idx);
    }
  }, [pathname, links.length, actualCenterIdx]);

  // Native wheel listener (to preventDefault body scroll) with delta
  // ACCUMULATION: trackpads fire dozens of tiny deltas per flick — stepping on
  // every event made the wheel spin wildly. We bank deltas and step once per
  // ~55px, allowing multiple steps for big flicks.
  const wheelAccum = useRef(0);
  useEffect(() => {
    const el = wheelRef.current;
    if (!el) return;

    const STEP = 100; // one mouse-wheel notch (~120) = one item; trackpads accumulate
    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault(); // Reliably stops body scroll
      // Dominant axis so horizontal trackpad swipes also turn the wheel
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      // Direction change: drop residue so the first opposite notch registers
      if (Math.sign(delta) !== Math.sign(wheelAccum.current)) wheelAccum.current = 0;
      wheelAccum.current += delta;

      const steps = Math.trunc(wheelAccum.current / STEP);
      if (steps !== 0) {
        wheelAccum.current -= steps * STEP;
        setScrollIndex(prev =>
          Math.min(actualCenterIdx, Math.max(prev - steps, -(links.length - 1 - actualCenterIdx)))
        );
      }
    };

    el.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleNativeWheel);
  }, [links.length, actualCenterIdx]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const currentY = e.touches[0].clientY;
    const diff = touchStartY.current - currentY;
    
    // threshold for swipe
    if (Math.abs(diff) > 20) {
      if (diff > 0) {
        // swipe up = scroll down
        setScrollIndex(prev => Math.max(prev - 1, -(links.length - 1 - actualCenterIdx)));
      } else {
        // swipe down = scroll up
        setScrollIndex(prev => Math.min(prev + 1, actualCenterIdx));
      }
      touchStartY.current = currentY; // reset to require another 20px drag
    }
  };

  const R = 420; // Radius of wheel
  const spacingDeg = 20; // Degrees between items

  return (
    <>
      <header ref={headerRef} className={`site-header minimal ${inGame ? "in-game-bar" : ""} ${collapsed ? "collapsed" : ""}`}>
        <Link href={getHref("/")} className="logo sober-logo" aria-label="Garden Retakes home">
          <span className="brand-mark" aria-hidden="true">
            <img src="/retakes_logo.png" alt="" width={34} height={34} />
          </span>
          <span className="brand-word">
            <span>R</span>
            <span>E</span>
            <span className="loader-e-extra">E</span>
            <span className="loader-e-extra">E</span>
            <span className="loader-e-extra">E</span>
            <span className="loader-e-extra">E</span>
            <span>T</span>
            <span>A</span>
            <span>K</span>
            <span>E</span>
            <span>S</span>
          </span>
        </Link>

        <div className="nav-account">
          <button
            type="button"
            className={`hdr-btn menu-trigger ${showWheel ? "active" : ""}`}
            onClick={() => setShowWheel(!showWheel)}
            aria-label={showWheel ? "Close menu" : "Open menu"}
            aria-expanded={showWheel}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              {showWheel ? (
                <>
                  <path d="M6 6l12 12" />
                  <path d="M18 6L6 18" />
                </>
              ) : (
                <>
                  <circle cx="5" cy="6" r="1.4" fill="currentColor" stroke="none" />
                  <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
                  <circle cx="5" cy="18" r="1.4" fill="currentColor" stroke="none" />
                  <path d="M10 6h9" />
                  <path d="M10 12h9" />
                  <path d="M10 18h9" />
                </>
              )}
            </svg>
            <span className="hdr-btn-label">Menu</span>
          </button>

          <ThemeToggle />

          {session.authenticated ? (
            <Link className="account-chip" href={getHref("/profile")} title="Edit your profile">
              {session.avatar && <img src={session.avatar} alt="" />}
              <span>{session.name ?? "Signed in"}</span>
            </Link>
          ) : (
            <a className="account-signin" href="/api/auth/steam/login">
              Sign in
            </a>
          )}

          {inGame && (
            <button
              type="button"
              className="hdr-icon-btn hide-header-btn"
              onClick={() => setHidden(true)}
              aria-label="Hide header"
              title="Hide header for a distraction-free game"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 15l6-6 6 6" />
              </svg>
            </button>
          )}
        </div>
      </header>

      {/* Restore tab — the only chrome left while the header is hidden mid-game. */}
      {collapsed && (
        <button
          type="button"
          className="header-peek"
          onClick={() => setHidden(false)}
          aria-label="Show header"
          title="Show header"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}

      {/* Wheel Nav Area */}
      <div
        className={`wheel-nav-container ${showWheel ? "open" : ""}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        ref={wheelRef}
      >
        <div className="wheel-hit" />
        <div className="wheel-background" />
        <div className="wheel-notch" aria-hidden="true" />
        <div className="wheel-circle">
          {links.map((l, idx) => {
            // angle from bottom center (90 deg)
            const itemOffset = idx - actualCenterIdx + scrollIndex;
            const angleDeg = 90 + (itemOffset * spacingDeg);
            const angleRad = (angleDeg * Math.PI) / 180;
            
            // X and Y relative to center of circle
            const x = Math.cos(angleRad) * R;
            const y = Math.sin(angleRad) * R;
            
            const isActive = itemOffset === 0;
            const isLiveItem = l.isLive;

            const isSectionItem = l.isSection;

            return (
              <div 
                key={`${l.label}-${l.href}`}
                className={`wheel-item ${isActive ? "active" : ""} ${isLiveItem ? "live-item" : ""} ${isSectionItem ? "section-item" : ""}`}
                style={{
                  transform: `translate(${x}px, ${y}px) rotate(${angleDeg - 90}deg) scale(${isActive ? (isLiveItem ? 1.4 : 1.25) : 1})`,
                  opacity: Math.abs(itemOffset) > 4 ? 0 : 1 - (Math.abs(itemOffset) * 0.15)
                }}
                onClick={() => {
                  setScrollIndex(actualCenterIdx - idx);
                  const newHref = getHref(l.href);
                  if (newHref.startsWith("http")) {
                    window.location.href = newHref;
                  } else {
                    router.push(newHref);
                  }
                }}
              >
                {l.label}
                {isLiveItem && isLiveServer && <div className="live-dot" />}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
