"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Circle,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Swords,
  Terminal,
  UserMinus,
} from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { playerMatcher, type PluginKind } from "@/lib/serverControl";
import "./servercontrol.css";

/**
 * The fleet, one server at a time.
 *
 * Console and Control used to be two tabs. They were never two jobs: every
 * question the buttons answer ("did that work?") is answered by the console,
 * and every command the console is used for has a button somewhere. Splitting
 * them meant an admin ran a command in one tab and went to the other to find
 * out what happened.
 *
 * One server visible at a time rather than seven panes. Seven consoles polling
 * at once is seven times the traffic to watch one of them, and a wall of seven
 * scrollbacks is unreadable — the useful comparison between servers is "which
 * is busy", which the switcher's own row already answers.
 */

type ConsoleLine = {
  seq: number;
  at: string;
  who: string;
  command: string;
  output: string;
  ok: boolean;
  kind: string;
};

type StatusPlayer = { userId: string; name: string; steamId: string | null; ping: number | null };

type ServerRow = { id: number; name: string; isTournament?: boolean };

type Snapshot = {
  serverId: number;
  serverName: string;
  isFullAdmin: boolean;
  online: boolean;
  error: string | null;
  map: string | null;
  players: StatusPlayer[];
  plugin: PluginKind;
  tail: { configured: boolean; live: boolean; lines: number; lastAt: string | null };
  sinkUrl: string | null;
};

const MAPS = ["de_dust2", "de_mirage", "de_inferno", "de_nuke", "de_ancient", "de_anubis", "de_overpass", "de_train"];

export default function ServerControl({ adminKey }: { adminKey?: string }) {
  const { t } = useI18n();
  const keyQuery = adminKey ? `&key=${encodeURIComponent(adminKey)}` : "";

  const [servers, setServers] = useState<ServerRow[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [command, setCommand] = useState("");
  const [picking, setPicking] = useState(false);

  /**
   * Highest sequence seen, per server.
   *
   * A ref rather than state: the poll reads it every two seconds and writing it
   * through state would re-run the effect that owns the poll, which is how a
   * polling loop turns into two polling loops.
   */
  const cursor = useRef<Map<number, number>>(new Map());
  const scroller = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch(`/api/admin/servers?${keyQuery.slice(1)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const rows: ServerRow[] = d.servers ?? [];
        setServers(rows);
        setActive((current) => current ?? rows[0]?.id ?? null);
      })
      .catch(() => setServers([]));
  }, [keyQuery]);

  /** The scrollback for the open server, and everything `status` reports. */
  const poll = useCallback(
    async (serverId: number) => {
      const since = cursor.current.get(serverId) ?? 0;

      try {
        const res = await fetch(
          `/api/admin/console?serverId=${serverId}&since=${since}${keyQuery}`,
          { cache: "no-store" },
        );
        const data = await res.json();

        if (Array.isArray(data.lines) && data.lines.length > 0) {
          // Only for the server still open. An answer that arrives after the
          // admin has switched belongs to the pane they left.
          setActive((open) => {
            if (open === serverId) {
              setLines((old) => [...old, ...data.lines].slice(-400));
              cursor.current.set(serverId, data.lines[data.lines.length - 1].seq);
            }
            return open;
          });
        }
      } catch {
        // A dropped poll is a stale pane, not a broken one; the next one fixes it.
      }
    },
    [keyQuery],
  );

  const refresh = useCallback(
    async (serverId: number) => {
      try {
        const res = await fetch(`/api/admin/server-control?serverId=${serverId}${keyQuery}`, {
          cache: "no-store",
        });
        const data = await res.json();
        setActive((open) => {
          if (open === serverId) setSnap(res.ok ? data : null);
          return open;
        });
      } catch {
        /* left as it was */
      }
    },
    [keyQuery],
  );

  useEffect(() => {
    if (active === null) return;

    setLines([]);
    cursor.current.set(active, 0);
    setSnap(null);
    setNote(null);

    poll(active);
    refresh(active);

    const consoleTimer = setInterval(() => poll(active), 2000);
    // Status is a round trip to the game server, so it is asked for far less
    // often than the scrollback, which is already in memory on this side.
    const statusTimer = setInterval(() => refresh(active), 15000);

    return () => {
      clearInterval(consoleTimer);
      clearInterval(statusTimer);
    };
  }, [active, poll, refresh]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const send = useCallback(
    async (body: Record<string, unknown>) => {
      if (active === null) return null;
      setBusy(true);
      setNote(null);

      try {
        const res = await fetch("/api/admin/server-control", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...body, serverId: active, key: adminKey }),
        });
        const data = await res.json();

        if (!res.ok || data.ok === false) {
          setNote({ ok: false, text: data.error ?? t("servers.failed") });
        } else if (data.message) {
          setNote({ ok: true, text: String(data.message).slice(0, 300) });
        }

        await poll(active);
        return data;
      } catch (err) {
        setNote({ ok: false, text: String(err) });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [active, adminKey, poll, t],
  );

  const runCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = command.trim();
    if (!text) return;
    setCommand("");
    await send({ type: "exec", cfg: text });
  };

  if (servers.length === 0) {
    return <p className="muted">{t("servers.none")}</p>;
  }

  return (
    <div className="sc">
      {/* The fleet. Every server is a button whether it answered or not — a
          server missing from the row because it is down is a server nobody can
          go and look at, which is when you most want to. */}
      <div className="sc-fleet" role="tablist" aria-label={t("servers.fleet")}>
        {servers.map((server) => (
          <button
            key={server.id}
            role="tab"
            aria-selected={active === server.id}
            className={`sc-tab ${active === server.id ? "on" : ""}`}
            onClick={() => setActive(server.id)}
          >
            <Circle
              size={8}
              className={`sc-dot ${active === server.id && snap ? (snap.online ? "up" : "down") : ""}`}
              aria-hidden
            />
            <span>{server.name}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={active ?? "none"}
          className="sc-pane"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          <header className="sc-head">
            <div className="sc-head-what">
              <strong>{snap?.serverName ?? servers.find((s) => s.id === active)?.name}</strong>
              <span className="sc-meta">
                {snap
                  ? snap.online
                    ? `${snap.map ?? "—"} · ${snap.players.length} ${t("servers.playersOn")}`
                    : t("servers.offline")
                  : t("servers.checking")}
              </span>
            </div>

            <button className="btn btn-secondary btn-sm" onClick={() => active !== null && refresh(active)}>
              <RefreshCw size={14} aria-hidden />
              {t("servers.refresh")}
            </button>
          </header>

          {note && <p className={`sc-note ${note.ok ? "ok" : "bad"}`}>{note.text}</p>}

          <div className="sc-actions">
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => send({ type: "restart-round" })}>
              <RotateCcw size={14} aria-hidden />
              {t("servers.restartRound")}
            </button>
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => send({ type: "pause" })}>
              <Pause size={14} aria-hidden />
              {t("servers.pause")}
            </button>
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => send({ type: "unpause" })}>
              <Play size={14} aria-hidden />
              {t("servers.unpause")}
            </button>
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => send({ type: "reload-map" })}>
              <RefreshCw size={14} aria-hidden />
              {t("servers.reloadMap")}
            </button>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => setPicking(true)}>
              <Swords size={14} aria-hidden />
              {t("servers.startBlitz")}
            </button>
          </div>

          <div className="sc-row">
            <label className="sc-field">
              <span>{t("servers.map")}</span>
              <select
                defaultValue=""
                disabled={busy}
                onChange={(e) => e.target.value && send({ type: "map", map: e.target.value })}
              >
                <option value="">{t("servers.pickMap")}</option>
                {MAPS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>

            {/* The mode control needs to know which plugin answered, because the
                two families take different commands and a server running the
                wrong one replies "Unknown command" — which reads from here
                exactly like a mode change that worked. */}
            <ModeControls plugin={snap?.plugin ?? "unknown"} busy={busy} onSend={send} full={snap?.isFullAdmin ?? false} />
          </div>

          <ConsolePane
            lines={lines}
            scroller={scroller}
            tail={snap?.tail}
            sinkUrl={snap?.sinkUrl ?? null}
            busy={busy}
            onArm={() => send({ type: "arm-log" })}
          />

          <form className="sc-cmd" onSubmit={runCommand}>
            <Terminal size={14} aria-hidden />
            <input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder={t("servers.commandPlaceholder")}
              spellCheck={false}
              autoComplete="off"
            />
            <button className="btn btn-secondary btn-sm" type="submit" disabled={busy || !command.trim()}>
              {t("servers.run")}
            </button>
          </form>

          {snap && snap.players.length > 0 && (
            <details className="sc-players">
              <summary>{t("servers.onServer", { n: String(snap.players.length) })}</summary>
              <ul>
                {snap.players.map((p) => (
                  <li key={p.userId}>
                    <span className="sc-pname">{p.name}</span>
                    <span className="num sc-pid">{p.steamId ?? p.userId}</span>
                    <button
                      className="btn btn-danger btn-sm"
                      disabled={busy}
                      onClick={() => send({ type: "kick", target: p.steamId ?? p.userId })}
                    >
                      <UserMinus size={13} aria-hidden />
                      {t("servers.kick")}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </motion.div>
      </AnimatePresence>

      {picking && (
        <BlitzPicker
          adminKey={adminKey}
          onClose={() => setPicking(false)}
          onStart={async (teams) => {
            const data = await send({ type: "start-blitz", teams });
            if (data?.ok) setPicking(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * Mode and plugin controls.
 *
 * Split from the main body because what they offer depends on an answer that
 * arrives late — the plugin — and a control that changes what it does when a
 * fetch lands is easier to reason about as its own component.
 */
function ModeControls({
  plugin,
  busy,
  full,
  onSend,
}: {
  plugin: PluginKind;
  busy: boolean;
  full: boolean;
  onSend: (body: Record<string, unknown>) => Promise<unknown>;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState("");

  const family = plugin === "tournament" ? "tournament" : "ladder";

  return (
    <>
      <label className="sc-field">
        <span>{t("servers.mode")}</span>
        <div className="sc-inline">
          <input
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            placeholder={t("servers.modePlaceholder")}
            spellCheck={false}
          />
          <button
            className="btn btn-secondary btn-sm"
            disabled={busy || !mode.trim()}
            onClick={() => onSend({ type: "mode", mode: mode.trim(), family, plugin })}
          >
            {t("servers.apply")}
          </button>
        </div>
      </label>

      {/* A swap restarts the box, so it is a site-admin action and it says so
          rather than failing at the server with a 403 the presser cannot read. */}
      <label className="sc-field">
        <span>{t("servers.plugin")}</span>
        <div className="sc-inline">
          <span className="sc-plugin">{t(`servers.plugin.${plugin}`)}</span>
          {full && plugin !== "unknown" && (
            <button
              className="btn btn-danger btn-sm"
              disabled={busy}
              onClick={() => {
                if (!window.confirm(t("servers.swapConfirm"))) return;
                onSend({
                  type: "swap-plugin",
                  family: plugin === "tournament" ? "ladder" : "tournament",
                  plugin,
                });
              }}
            >
              {t("servers.swapTo", {
                what: plugin === "tournament" ? t("servers.plugin.ladder") : t("servers.plugin.tournament"),
              })}
            </button>
          )}
        </div>
      </label>
    </>
  );
}

/** The scrollback, plus an honest word about whether it is the whole story. */
function ConsolePane({
  lines,
  scroller,
  tail,
  sinkUrl,
  busy,
  onArm,
}: {
  lines: ConsoleLine[];
  scroller: React.MutableRefObject<HTMLDivElement | null>;
  tail?: Snapshot["tail"];
  sinkUrl: string | null;
  busy: boolean;
  onArm: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="sc-console">
      <div className="sc-console-head">
        <span>{t("servers.console")}</span>
        {/* Whether the server's own output is arriving, reported from a line
            having actually landed rather than from the arming command having
            been accepted — arming can be refused, unreachable or firewalled,
            and RCON says nothing about any of it. */}
        {tail && (
          <span className={`sc-tail ${tail.live ? "live" : ""}`}>
            {tail.live
              ? t("servers.tailLive", { n: String(tail.lines) })
              : tail.configured
                ? t("servers.tailIdle")
                : t("servers.tailUnconfigured")}
            {tail.configured && !tail.live && (
              <button className="btn btn-secondary btn-sm" disabled={busy} onClick={onArm}>
                {t("servers.arm")}
              </button>
            )}
          </span>
        )}
      </div>

      <div className="sc-scroll" ref={scroller}>
        {lines.length === 0 ? (
          <p className="sc-empty">{t("servers.consoleEmpty")}</p>
        ) : (
          lines.map((line) => (
            <div key={line.seq} className={`sc-line ${line.ok ? "" : "bad"} kind-${line.kind}`}>
              {line.command && (
                <div className="sc-line-cmd">
                  <span className="sc-who">{line.who}</span>
                  <code>{line.command}</code>
                </div>
              )}
              {line.output && <pre className="sc-line-out">{line.output}</pre>}
            </div>
          ))
        )}
      </div>

      {sinkUrl && tail && !tail.live && (
        <p className="sc-sink">
          {t("servers.sinkHint")} <code>{sinkUrl}</code>
        </p>
      )}
    </div>
  );
}

/**
 * Picking two sides.
 *
 * The list is every player the site knows, not only the ones currently on the
 * server: the point of the button is to start a match for people who are about
 * to connect. Searching is the same permissive matcher the server uses, so what
 * narrows here and what the API would accept cannot disagree.
 */
function BlitzPicker({
  adminKey,
  onClose,
  onStart,
}: {
  adminKey?: string;
  onClose: () => void;
  onStart: (teams: { name: string; players: { steamId: string; name?: string }[] }[]) => void;
}) {
  const { t } = useI18n();

  const [all, setAll] = useState<{ steamId: string; name: string; avatar?: string | null }[]>([]);
  const [query, setQuery] = useState("");
  const [a, setA] = useState<string[]>([]);
  const [b, setB] = useState<string[]>([]);

  useEffect(() => {
    fetch(`/api/admin/players?limit=300${adminKey ? `&key=${encodeURIComponent(adminKey)}` : ""}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => setAll(d.players ?? []))
      .catch(() => setAll([]));
  }, [adminKey]);

  const shown = useMemo(() => {
    const match = playerMatcher(query);
    return all.filter((p) => match({ name: p.name ?? "", steamId: p.steamId })).slice(0, 60);
  }, [all, query]);

  const side = (id: string): "a" | "b" | null => (a.includes(id) ? "a" : b.includes(id) ? "b" : null);

  /** One click cycles a player A → B → out, so no per-row radio is needed. */
  const cycle = (id: string) => {
    const where = side(id);
    setA((x) => x.filter((v) => v !== id));
    setB((x) => x.filter((v) => v !== id));
    if (where === null) setA((x) => [...x, id]);
    else if (where === "a") setB((x) => [...x, id]);
  };

  const named = (ids: string[]) =>
    ids.map((id) => ({ steamId: id, name: all.find((p) => p.steamId === id)?.name }));

  return (
    <div className="sc-modal" role="dialog" aria-modal="true">
      <div className="sc-modal-box">
        <header className="sc-modal-head">
          <h3>{t("servers.startBlitz")}</h3>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            {t("common.close")}
          </button>
        </header>

        <div className="sc-search">
          <Search size={14} aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("servers.searchPlayers")}
            spellCheck={false}
            autoComplete="off"
          />
        </div>

        <p className="muted sc-hint">{t("servers.pickHint")}</p>

        <ul className="sc-picklist">
          {shown.map((p) => {
            const where = side(p.steamId);
            return (
              <li key={p.steamId}>
                <button className={`sc-pick ${where ?? ""}`} onClick={() => cycle(p.steamId)}>
                  {p.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="sc-avatar" src={p.avatar} alt="" width={22} height={22} />
                  ) : (
                    <span className="sc-avatar sc-avatar-none" aria-hidden />
                  )}
                  <span className="sc-pick-name">{p.name || p.steamId}</span>
                  {where && <span className={`sc-side ${where}`}>{where.toUpperCase()}</span>}
                </button>
              </li>
            );
          })}
        </ul>

        <footer className="sc-modal-foot">
          <span className="muted">
            {t("servers.sides", { a: String(a.length), b: String(b.length) })}
          </span>
          <button
            className="btn btn-primary"
            disabled={a.length === 0 || b.length === 0}
            onClick={() =>
              onStart([
                { name: "Team A", players: named(a) },
                { name: "Team B", players: named(b) },
              ])
            }
          >
            <Swords size={15} aria-hidden />
            {t("servers.startBlitz")}
          </button>
        </footer>
      </div>
    </div>
  );
}
