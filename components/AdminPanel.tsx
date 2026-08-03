"use client";

import { useCallback, useEffect, useState } from "react";
import RconConsole from "@/components/RconConsole";
import SkinManager from "@/components/admin/SkinManager";
import PluginConfigEditor from "@/components/admin/PluginConfigEditor";
import PendingDemos from "@/components/admin/PendingDemos";
import AdminOverview from "@/components/admin/AdminOverview";
import { GAME_MODES } from "@/lib/gameModes";

// The panel was three stacked sections with the player table — the tallest of
// them — dominating the page, and the admin log and custom skins living on
// separate URLs entirely. Everything is a tab now, and the player rows are
// compact enough that a full server fits on one screen.

type Player = {
  steamId: string;
  name: string;
  steamName: string;
  hasOverride: boolean;
  lastSeen: string;
  role: number;
  banned: boolean;
  banReason: string | null;
  banExpires: string | null;
};

type LogEntry = {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string | null;
  detail: string | null;
};

type TabId = "overview" | "players" | "server" | "config" | "console" | "skins" | "demos" | "log";

/**
 * Sections, grouped.
 *
 * A flat strip of seven tabs made every section look equally likely to be what
 * you wanted, and gave no clue what any of them did before clicking. Grouping
 * them by what they act on — people, the server itself, what players posted,
 * the system — plus a line of description each, means the panel can be read
 * rather than explored.
 */
const SECTIONS: {
  group: string;
  items: { id: TabId; label: string; icon: string; hint: string; level: number }[];
}[] = [
  {
    group: "Overview",
    items: [{ id: "overview", label: "Dashboard", icon: "◈", hint: "What needs attention", level: 1 }],
  },
  {
    group: "Community",
    items: [
      { id: "players", label: "Players", icon: "◉", hint: "Roles, names, bans", level: 0 },
      { id: "skins", label: "Custom skins", icon: "✦", hint: "VPKs served to clients", level: 0 },
      { id: "demos", label: "Queue", icon: "⏵", hint: "Demos and clip marks waiting", level: 2 },
    ],
  },
  {
    group: "Server",
    items: [
      { id: "server", label: "Control", icon: "▣", hint: "Map, game mode, restarts", level: 1 },
      { id: "config", label: "Plugin config", icon: "⚙", hint: "Rankings, allocator, game rules", level: 2 },
      { id: "console", label: "Console", icon: "❯", hint: "Raw RCON", level: 2 },
    ],
  },
  {
    group: "System",
    items: [{ id: "log", label: "Audit log", icon: "☰", hint: "Who did what", level: 0 }],
  },
];

const ROLE_LABEL = ["—", "Moderator", "Admin", "Owner"];

/**
 * Maps the plugin can load.
 *
 * Train came back into the base game, so it is a stock map again rather than a
 * workshop id — everything here ships with CS2 and needs no addon mounted.
 */
/**
 * Maps, with the names people actually say.
 *
 * The buttons showed raw file names — "de_dust2" — which is what the command
 * needs, not what anyone calls it. The id goes to the server, the label goes on
 * the button.
 */
const STOCK_MAPS: { id: string; label: string; colour: string }[] = [
  // Each map's own palette rather than the site accent, so the row is scannable
  // by colour before it is read.
  { id: "de_mirage", label: "Mirage", colour: "#d9c39a" },
  { id: "de_inferno", label: "Inferno", colour: "#c0392b" },
  { id: "de_nuke", label: "Nuke", colour: "#2c3e6b" },
  { id: "de_ancient", label: "Ancient", colour: "#4b8b3b" },
  { id: "de_dust2", label: "Dust II", colour: "#e0b642" },
  { id: "de_anubis", label: "Anubis", colour: "#d66a9c" },
  { id: "de_cache", label: "Cache", colour: "#5a5a5a" },
  { id: "de_overpass", label: "Overpass", colour: "#e08a3c" },
  { id: "de_vertigo", label: "Vertigo", colour: "#7fb6d9" },
  { id: "de_train", label: "Train", colour: "#b6b6b6" },
];

export default function AdminPanel({
  viewerLevel,
  adminKey,
}: {
  viewerLevel: number;
  adminKey?: string;
}) {
  const [tab, setTab] = useState<TabId>("overview");
  const [players, setPlayers] = useState<Player[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [mapInput, setMapInput] = useState("");
  const [log, setLog] = useState<LogEntry[] | null>(null);

  const canMod = viewerLevel >= 1;
  const canAdmin = viewerLevel >= 2;
  const canOwner = viewerLevel >= 3;

  // Sections above a viewer's level are hidden rather than shown disabled: a
  // greyed-out row invites a request for access the panel cannot grant.
  const visible = SECTIONS.map((sec) => ({
    ...sec,
    items: sec.items.filter((i) => viewerLevel >= i.level),
  })).filter((sec) => sec.items.length > 0);

  const current = SECTIONS.flatMap((s) => s.items).find((i) => i.id === tab);

  // The open section lives in the URL, so a reload — or a link to someone —
  // lands where it should.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && SECTIONS.some((s) => s.items.some((i) => i.id === t))) setTab(t as TabId);
  }, []);

  const go = (id: string) => {
    setTab(id as TabId);
    const q = new URLSearchParams(window.location.search);
    q.set("tab", id);
    window.history.replaceState(null, "", `${window.location.pathname}?${q}`);
  };

  const load = useCallback(
    async (query: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (query) params.set("q", query);
        if (adminKey) params.set("key", adminKey);
        const res = await fetch(`/api/admin/players?${params.toString()}`);
        const json = await res.json();
        if (res.ok) setPlayers(json.players);
      } finally {
        setLoading(false);
      }
    },
    [adminKey]
  );

  useEffect(() => {
    load("");
  }, [load]);

  // The log is only fetched when its tab is first opened.
  useEffect(() => {
    if (tab !== "log" || log !== null) return;
    fetch(`/api/admin/log${adminKey ? `?key=${encodeURIComponent(adminKey)}` : ""}`)
      .then((r) => r.json())
      .then((j) => setLog(j.entries ?? []))
      .catch(() => setLog([]));
  }, [tab, log, adminKey]);

  const flash = (ok: boolean, text: string) => {
    setToast({ ok, text });
    setTimeout(() => setToast(null), 3500);
  };

  const doAction = async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/admin/action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, key: adminKey }),
    });
    const json = await res.json();
    flash(res.ok && json.ok, json.message ?? json.error ?? "Done.");
    if (res.ok) load(q);
  };

  const onBan = (p: Player) => {
    const reason = window.prompt(`Ban ${p.name} — reason?`, "Cheating");
    if (reason === null) return;
    const durRaw = window.prompt("Duration in minutes (0 or blank = permanent):", "0");
    if (durRaw === null) return;
    doAction({ type: "ban", steamId: p.steamId, reason, minutes: Number(durRaw) || 0 });
  };

  const onRename = (p: Player) => {
    const name = window.prompt(`New display name for ${p.name}:`, p.name);
    if (name === null || name.trim() === "") return;
    doAction({ type: "setName", steamId: p.steamId, name });
  };

  return (
    <>
      {toast && <div className={`admin-toast ${toast.ok ? "ok" : "error"}`}>{toast.text}</div>}

      <div className="adm-shell">
      <nav className="adm-nav" aria-label="Admin sections">
        {visible.map((sec) => (
          <div key={sec.group} className="adm-nav-group">
            <span className="adm-nav-title">{sec.group}</span>
            {sec.items.map((t) => (
          <button
            key={t.id}
            id={`adm-tab-${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            aria-controls={`adm-panel-${t.id}`}
            className={`adm-nav-item ${tab === t.id ? "active" : ""}`}
            onClick={() => go(t.id)}
          >
            <span className="adm-nav-icon" aria-hidden>{t.icon}</span>
            <span className="adm-nav-text">
              <span className="adm-nav-label">
                {t.label}
                {t.id === "players" && players.length > 0 && <span className="pro-tab-count">{players.length}</span>}
              </span>
              <span className="adm-nav-hint">{t.hint}</span>
            </span>
          </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="adm-panel" id={`adm-panel-${tab}`} aria-labelledby={`adm-tab-${tab}`}>
        {current && (
          <header className="adm-head">
            <h2>{current.label}</h2>
            <p>{current.hint}</p>
          </header>
        )}

        {tab === "overview" && <AdminOverview adminKey={adminKey ?? ""} onGo={go} />}

        {tab === "players" && (
          <>
            <form
              className="admin-inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                load(q);
              }}
            >
              <label className="sr-only" htmlFor="adm-search">Search players</label>
              <input
                id="adm-search"
                className="input"
                value={q}
                placeholder="Search by name or SteamID64…"
                onChange={(e) => setQ(e.target.value)}
                style={{ maxWidth: 340 }}
              />
              <button className="btn btn-secondary" type="submit">Search</button>
              {loading && <span className="muted">Loading…</span>}
            </form>

            <div className="adm-scroll">
              <table className="table adm-players">
                <thead>
                  <tr>
                    <th scope="col">Player</th>
                    <th scope="col">Role</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="adm-actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {players.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="muted" style={{ textAlign: "center", padding: 24 }}>
                        {loading ? "Loading…" : "No players found."}
                      </td>
                    </tr>
                  ) : (
                    players.map((p) => (
                      <tr key={p.steamId} className={p.banned ? "row-banned" : ""}>
                        <td>
                          <a href={`/players/${p.steamId}`} className="adm-pname">{p.name}</a>
                          {p.hasOverride && <span className="mini-badge">override</span>}
                          <div className="adm-steamid num">{p.steamId}</div>
                        </td>
                        <td>{p.role > 0 ? <span className="role-badge sm">{ROLE_LABEL[p.role]}</span> : "—"}</td>
                        <td>
                          {p.banned ? (
                            <span className="mini-badge danger" title={p.banReason ?? ""}>
                              banned{p.banExpires ? "" : " ∞"}
                            </span>
                          ) : (
                            <span className="muted">ok</span>
                          )}
                        </td>
                        <td className="adm-actions-col">
                          <div className="adm-actions">
                            {canMod && <button className="btn btn-secondary" onClick={() => doAction({ type: "kick", name: p.steamName })}>Kick</button>}
                            {canAdmin && <button className="btn btn-secondary" onClick={() => doAction({ type: "slay", name: p.steamName })}>Slay</button>}
                            {canAdmin && !p.banned && <button className="btn btn-secondary" onClick={() => onBan(p)}>Ban</button>}
                            {canAdmin && p.banned && <button className="btn btn-secondary" onClick={() => doAction({ type: "unban", steamId: p.steamId })}>Unban</button>}
                            {canAdmin && <button className="btn btn-ghost" onClick={() => onRename(p)}>Rename</button>}
                            {canAdmin && p.hasOverride && <button className="btn btn-ghost" onClick={() => doAction({ type: "clearName", steamId: p.steamId })}>Reset</button>}
                            {canOwner && (
                              <>
                                <label className="sr-only" htmlFor={`role-${p.steamId}`}>Role for {p.name}</label>
                                <select
                                  id={`role-${p.steamId}`}
                                  className="input adm-role"
                                  value={p.role}
                                  onChange={(e) => {
                                    const level = Number(e.target.value);
                                    if (level === 0) doAction({ type: "removeRole", steamId: p.steamId });
                                    else doAction({ type: "setRole", steamId: p.steamId, level });
                                  }}
                                >
                                  <option value={0}>No role</option>
                                  <option value={1}>Moderator</option>
                                  <option value={2}>Admin</option>
                                  <option value={3}>Owner</option>
                                </select>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "server" && canMod && (
          <div className="adm-server">
            <section>
              <h3>Game mode</h3>
              <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                Switches the plugin's active mode. Takes effect on the next round or map change.
              </p>
              <div className="adm-modes">
                {GAME_MODES.map((m) => (
                  <button
                    key={m.id}
                    className="adm-mode"
                    disabled={!canAdmin}
                    title={canAdmin ? m.hint : "Admin role required"}
                    onClick={() => doAction({ type: "gamemode", mode: m.id })}
                  >
                    <span className="adm-mode-name">{m.label}</span>
                    <span className="adm-mode-hint">{m.hint}</span>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h3>Map</h3>
              <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                All of these ship with CS2 — Train included, since it returned to the base game — so none of
                them needs a workshop addon mounted.
              </p>
              {/* Same control as the game modes beside them: these do the same
                  kind of thing and looked like two different features. */}
              <div className="adm-modes">
                {STOCK_MAPS.map((m) => (
                  <button
                    key={m.id}
                    className="adm-mode adm-map"
                    title={m.id}
                    style={{ ["--map" as string]: m.colour }}
                    onClick={() => doAction({ type: "map", map: m.id })}
                  >
                    <span className="adm-mode-name">{m.label}</span>
                    <span className="adm-mode-hint num">{m.id}</span>
                  </button>
                ))}
              </div>
              <form
                className="admin-inline-form"
                style={{ marginTop: "var(--space-4)" }}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (mapInput.trim()) doAction({ type: "map", map: mapInput });
                }}
              >
                <label className="sr-only" htmlFor="adm-map">Workshop or custom map</label>
                <input
                  id="adm-map"
                  className="input"
                  value={mapInput}
                  placeholder="workshop or custom map name"
                  onChange={(e) => setMapInput(e.target.value)}
                  style={{ maxWidth: 280 }}
                />
                <button className="btn btn-secondary" type="submit">Change map</button>
              </form>
            </section>
          </div>
        )}

        {tab === "config" && canAdmin && <PluginConfigEditor adminKey={adminKey} />}

        {tab === "console" && canAdmin && <RconConsole adminKey={adminKey} />}

        {tab === "skins" && <SkinManager adminKey={adminKey} canUpload={canAdmin} />}

        {tab === "demos" && canAdmin && <PendingDemos adminKey={adminKey} />}

        {tab === "log" && (
          <div className="adm-scroll">
            {log === null ? (
              <p className="muted">Loading…</p>
            ) : log.length === 0 ? (
              <p className="empty-hint">No admin actions logged yet.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">When (UTC)</th>
                    <th scope="col">Actor</th>
                    <th scope="col">Action</th>
                    <th scope="col">Target</th>
                    <th scope="col">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((e) => (
                    <tr key={e.id}>
                      <td className="muted num">{e.at.replace("T", " ").slice(0, 19)}</td>
                      <td>{e.actor}</td>
                      <td><strong>{e.action}</strong></td>
                      <td>{e.target ?? "—"}</td>
                      <td className="muted">{e.detail ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
      </div>
    </>
  );
}
