"use client";

/*
 * The command palette — Ctrl/⌘K from anywhere.
 *
 * The rail holds a curated dozen destinations as icons; the site has more pages
 * than that and a few hundred players, and until now the only way to reach a
 * player was to find them in a table first. This is the one place that reaches
 * all of it by typing: every page in lib/siteMap.ts, any player by name, and
 * the handful of actions people otherwise hunt for (connect, copy the address,
 * theme, language, sign in and out).
 *
 * Also owns the site's keyboard layer, so there is one listener and one list to
 * read: `g` then a letter jumps to a page, `?` shows what exists. Every key is
 * ignored while a text field has focus, and `/` is left alone on purpose — the
 * inventory already uses it for its own search.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ArrowRight,
  Clipboard,
  CornerDownLeft,
  Gamepad2,
  Globe,
  Keyboard,
  LogIn,
  LogOut,
  Moon,
  Search,
  Sun,
  User,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { LOCALES } from "@/lib/i18n";
import { DEMO_ALLOWLIST, SITE_GROUPS, SITE_MAP, scoreEntry, type SiteEntry } from "@/lib/siteMap";
import "./command-palette.css";

/** Open the palette from anywhere: `window.dispatchEvent(new Event(OPEN_PALETTE))`. */
export const OPEN_PALETTE = "garden:command-palette";

const SERVER_ADDRESS = process.env.NEXT_PUBLIC_SERVER_ADDRESS || "play.retakes.fr";
const RECENT_KEY = "garden_palette_recent";

/** `g` then a letter. Kept short and mnemonic; the help overlay lists them. */
const JUMPS: { key: string; href: string }[] = [
  { key: "h", href: "/" },
  { key: "s", href: "/stats" },
  { key: "l", href: "/live" },
  { key: "m", href: "/lobby" },
  { key: "i", href: "/inventory" },
  { key: "t", href: "/tournaments" },
  { key: "f", href: "/feed" },
  { key: "u", href: "/utility" },
  { key: "p", href: "/profile" },
  { key: ",", href: "/settings" },
];

type Session = { authenticated: boolean; steamId?: string | null; name?: string | null };
type Player = { steamId: string; name: string };

type Item = {
  id: string;
  section: string;
  label: string;
  hint?: string;
  icon?: LucideIcon;
  shortcut?: string;
  run: () => void;
};

const isTyping = (el: Element | null) =>
  el instanceof HTMLInputElement ||
  el instanceof HTMLTextAreaElement ||
  el instanceof HTMLSelectElement ||
  (el instanceof HTMLElement && el.isContentEditable);

function readRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

function pushRecent(href: string) {
  try {
    const next = [href, ...readRecent().filter((h) => h !== href)].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — recents are a convenience */
  }
}

/**
 * @param demo The site is in demo mode: offer only DEMO_ALLOWLIST's pages, no
 *   player search and no jumps elsewhere — a demo is a curated walk, and a
 *   palette listing everything would be the way out of it.
 */
export default function CommandPalette({ demo = false }: { demo?: boolean }) {
  const { t, locale, setLocale } = useI18n();
  const allowed = useCallback((href: string) => !demo || DEMO_ALLOWLIST.includes(href), [demo]);
  const jumps = useMemo(() => JUMPS.filter((j) => allowed(j.href)), [allowed]);
  const { resolvedTheme, setTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [players, setPlayers] = useState<Player[]>([]);
  const [searching, setSearching] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const gPending = useRef<number | null>(null);

  useEffect(() => setMounted(true), []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setPlayers([]);
    setActive(0);
  }, []);

  const openPalette = useCallback(() => {
    setHelp(false);
    setRecent(readRecent());
    setOpen(true);
  }, []);

  // Close on navigation — the palette is a way to get somewhere, not a place.
  useEffect(() => {
    close();
    setHelp(false);
  }, [pathname, close]);

  // The session, fetched the first time it is needed.
  useEffect(() => {
    if (!open || session) return;
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((s: Session) => setSession(s))
      .catch(() => setSession({ authenticated: false }));
  }, [open, session]);

  // Focus the field on open.
  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  // Player search, debounced; two characters minimum so "a" does not return
  // the whole server.
  useEffect(() => {
    const q = query.trim();
    if (!open || demo || q.length < 2) {
      setPlayers([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const ctrl = new AbortController();
    const h = window.setTimeout(() => {
      fetch(`/api/players/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { players: [] }))
        .then((d: { players?: Player[] }) => setPlayers(Array.isArray(d.players) ? d.players.slice(0, 6) : []))
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 160);
    return () => {
      ctrl.abort();
      window.clearTimeout(h);
    };
  }, [query, open, demo]);

  const go = useCallback(
    (href: string) => {
      pushRecent(href);
      close();
      router.push(href);
    },
    [close, router],
  );

  // ---------- global keys ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) close();
        else openPalette();
        return;
      }
      if (open || e.metaKey || e.ctrlKey || e.altKey || isTyping(document.activeElement)) return;

      if (e.key === "?") {
        e.preventDefault();
        setHelp((v) => !v);
        return;
      }
      if (e.key === "Escape" && help) {
        setHelp(false);
        return;
      }
      if (gPending.current !== null) {
        const jump = jumps.find((j) => j.key === e.key.toLowerCase());
        window.clearTimeout(gPending.current);
        gPending.current = null;
        if (jump) {
          e.preventDefault();
          router.push(jump.href);
        }
        return;
      }
      if (e.key === "g") {
        gPending.current = window.setTimeout(() => (gPending.current = null), 1200);
      }
    };
    const onOpen = () => openPalette();
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE, onOpen);
    };
  }, [open, help, close, openPalette, router, jumps]);

  // ---------- items ----------
  const pageLabel = useCallback((entry: SiteEntry) => t(entry.labelKey), [t]);
  const pageDesc = useCallback((entry: SiteEntry) => t(entry.descKey), [t]);

  const items: Item[] = useMemo(() => {
    const q = query.trim();
    const signedIn = !!session?.authenticated;
    const out: Item[] = [];
    const groupName = (id: string) => {
      const g = SITE_GROUPS.find((x) => x.id === id);
      return g ? t(g.key) : id;
    };

    // Recent, only on an empty query.
    if (!q) {
      for (const href of recent) {
        const entry = SITE_MAP.find((x) => x.href === href);
        if (!entry || !allowed(href)) continue;
        out.push({
          id: `recent:${href}`,
          section: t("cmd.section.recent"),
          label: pageLabel(entry),
          hint: pageDesc(entry),
          run: () => go(href),
        });
      }
    }

    // Players.
    for (const p of players) {
      out.push({
        id: `player:${p.steamId}`,
        section: t("cmd.section.players"),
        label: p.name,
        hint: t("cmd.player.hint"),
        icon: User,
        run: () => go(`/players/${p.steamId}`),
      });
    }

    // Pages, ranked; on an empty query, in site-map order by group.
    const pages = SITE_MAP.filter((entry) => (!entry.auth || signedIn) && allowed(entry.href))
      .map((entry) => {
        const translated = { label: pageLabel(entry), desc: pageDesc(entry), keywords: entry.keywords, href: entry.href };
        // Match both the translated and the English label, so "stats" still
        // finds Statistiques for somebody browsing in French.
        const score = Math.max(scoreEntry(translated, q), scoreEntry(entry, q));
        return { entry, score };
      })
      .filter((x) => x.score > 0);
    if (q) pages.sort((a, b) => b.score - a.score);
    for (const { entry } of pages.slice(0, q ? 8 : pages.length)) {
      const jump = jumps.find((j) => j.href === entry.href);
      out.push({
        id: `page:${entry.href}`,
        section: q ? t("cmd.section.pages") : groupName(entry.group),
        label: pageLabel(entry),
        hint: pageDesc(entry),
        shortcut: jump ? `g ${jump.key}` : undefined,
        run: () => go(entry.href),
      });
    }

    // Actions.
    const actions: Omit<Item, "section">[] = [
      {
        id: "act:connect",
        label: t("cmd.act.connect"),
        hint: SERVER_ADDRESS,
        icon: Gamepad2,
        run: () => {
          close();
          window.location.href = `steam://connect/${SERVER_ADDRESS}`;
        },
      },
      {
        id: "act:copy",
        label: copied ? t("cmd.act.copied") : t("cmd.act.copy"),
        hint: `connect ${SERVER_ADDRESS}`,
        icon: Clipboard,
        run: () => {
          navigator.clipboard
            .writeText(`connect ${SERVER_ADDRESS}`)
            .then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            })
            .catch(() => {});
        },
      },
      {
        id: "act:theme",
        label: resolvedTheme === "dark" ? t("cmd.act.light") : t("cmd.act.dark"),
        icon: resolvedTheme === "dark" ? Sun : Moon,
        run: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
      },
      ...LOCALES.filter((l) => l.id !== locale).map((l) => ({
        id: `act:lang:${l.id}`,
        label: t("cmd.act.language", { lang: l.label }),
        icon: Globe,
        run: () => {
          setLocale(l.id);
          close();
        },
      })),
      {
        id: "act:keys",
        label: t("cmd.act.shortcuts"),
        icon: Keyboard,
        shortcut: "?",
        run: () => {
          close();
          setHelp(true);
        },
      },
      signedIn
        ? {
            id: "act:logout",
            label: t("nav.signOut"),
            icon: LogOut,
            run: () => {
              window.location.href = "/api/auth/logout";
            },
          }
        : {
            id: "act:login",
            label: t("nav.signIn"),
            hint: "Steam",
            icon: LogIn,
            run: () => {
              window.location.href = `/api/auth/steam/login?returnTo=${encodeURIComponent(pathname || "/")}`;
            },
          },
    ];
    for (const a of actions) {
      // The server is not part of a tournament pitch.
      if (demo && (a.id === "act:connect" || a.id === "act:copy")) continue;
      if (q && scoreEntry({ label: a.label, desc: a.hint ?? "", href: "" }, q) === 0) continue;
      out.push({ ...a, section: t("cmd.section.actions") });
    }
    return out;
  }, [query, session, recent, players, t, pageLabel, pageDesc, go, copied, resolvedTheme, setTheme, locale, setLocale, close, pathname, allowed, jumps, demo]);

  // Keep the highlight in range and in view.
  useEffect(() => {
    if (active >= items.length) setActive(Math.max(0, items.length - 1));
  }, [items.length, active]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (items.length ? (i + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[active]?.run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      e.preventDefault();
    }
  };

  if (!mounted) return null;

  const palette = open && (
    <div className="cmdk-scrim" onMouseDown={close} role="presentation">
      <div
        className="cmdk"
        role="dialog"
        aria-modal="true"
        aria-label={t("cmd.title")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="cmdk-field">
          <Search size={17} aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKey}
            placeholder={t("cmd.placeholder")}
            aria-label={t("cmd.placeholder")}
            aria-controls="cmdk-list"
            aria-activedescendant={items[active] ? `cmdk-${active}` : undefined}
            role="combobox"
            aria-expanded="true"
            spellCheck={false}
            autoComplete="off"
          />
          {searching && <span className="cmdk-spinner" aria-hidden />}
          <kbd className="cmdk-esc">Esc</kbd>
        </div>

        <div className="cmdk-list" id="cmdk-list" role="listbox" ref={listRef}>
          {items.length === 0 ? (
            <div className="cmdk-empty">{t("cmd.empty", { q: query.trim() })}</div>
          ) : (
            items.map((item, i) => {
              const Icon = item.icon ?? ArrowRight;
              const newSection = i === 0 || items[i - 1].section !== item.section;
              return (
                <div key={item.id}>
                  {newSection && <div className="cmdk-section">{item.section}</div>}
                  <div
                    id={`cmdk-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={i === active}
                    className={`cmdk-item ${i === active ? "on" : ""}`}
                    onMouseMove={() => i !== active && setActive(i)}
                    onClick={() => item.run()}
                  >
                    <Icon size={15} className="cmdk-icon" aria-hidden />
                    <span className="cmdk-label">{item.label}</span>
                    {item.hint && <span className="cmdk-hint">{item.hint}</span>}
                    {item.shortcut && <kbd className="cmdk-kbd">{item.shortcut}</kbd>}
                    {i === active && <CornerDownLeft size={13} className="cmdk-enter" aria-hidden />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="cmdk-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> {t("cmd.foot.move")}</span>
          <span><kbd>↵</kbd> {t("cmd.foot.open")}</span>
          <span><kbd>?</kbd> {t("cmd.foot.shortcuts")}</span>
        </div>
      </div>
    </div>
  );

  const helpSheet = help && (
    <div className="cmdk-scrim" onMouseDown={() => setHelp(false)} role="presentation">
      <div className="cmdk cmdk-help" role="dialog" aria-modal="true" aria-label={t("cmd.act.shortcuts")} onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="cmdk-help-title">
          <Keyboard size={18} /> {t("cmd.act.shortcuts")}
        </h2>
        <div className="cmdk-help-grid">
          <section>
            <h3>{t("cmd.help.everywhere")}</h3>
            <dl>
              <dt><kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>K</kbd></dt><dd>{t("cmd.help.palette")}</dd>
              <dt><kbd>?</kbd></dt><dd>{t("cmd.help.this")}</dd>
              <dt><kbd>Esc</kbd></dt><dd>{t("cmd.help.close")}</dd>
            </dl>
          </section>
          <section>
            <h3>{t("cmd.help.goto")}</h3>
            <dl>
              {jumps.map((j) => {
                const entry = SITE_MAP.find((x) => x.href === j.href);
                return (
                  <div key={j.key} className="cmdk-help-row">
                    <dt><kbd>g</kbd> <kbd>{j.key}</kbd></dt>
                    <dd>{entry ? pageLabel(entry) : t("cmd.help.home")}</dd>
                  </div>
                );
              })}
            </dl>
          </section>
          {!demo && <section>
            <h3>{t("cmd.help.inventory")}</h3>
            <dl>
              <dt><kbd>/</kbd> <kbd>F</kbd></dt><dd>{t("cmd.help.invSearch")}</dd>
              <dt><kbd>T</kbd> <kbd>C</kbd></dt><dd>{t("cmd.help.invSide")}</dd>
              <dt><kbd>Esc</kbd></dt><dd>{t("cmd.help.invBack")}</dd>
            </dl>
          </section>}
        </div>
      </div>
    </div>
  );

  return createPortal(
    <>
      {palette}
      {helpSheet}
    </>,
    document.body,
  );
}
