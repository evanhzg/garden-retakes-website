"use client";

import { useCallback, useEffect, useState } from "react";
import RconConsole from "@/components/RconConsole";
import SkinManager from "@/components/admin/SkinManager";
import PluginConfigEditor from "@/components/admin/PluginConfigEditor";
import SeasonManager from "@/components/admin/SeasonManager";
import PendingDemos from "@/components/admin/PendingDemos";
import AdminOverview from "@/components/admin/AdminOverview";
import CaptureSuggestions from "@/components/admin/CaptureSuggestions";
import SafeQueue from "@/components/admin/SafeQueue";
import MapManager from "@/components/admin/MapManager";
import { useI18n } from '@/components/I18nProvider';
import { GAME_MODES, RETAKE_FLAVOURS } from "@/lib/gameModes";
import { freezeDate, freezeLeft, isFrozen, type FreezePoll } from "@/lib/seasonFreeze";

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

type TabId = "overview" | "players" | "server" | "config" | "console" | "skins" | "demos" | "captures" | "log" | "season" | "safequeue" | "maps";

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
      { id: "captures", label: "Captures", icon: "📷", hint: "Capture suggestions", level: 1 },
      { id: "safequeue", label: "Safe Queue", icon: "🛡️", hint: "Review queue requests", level: 1 },
    ],
  },
  {
    group: "Server",
    items: [
      { id: "server", label: "Control", icon: "▣", hint: "Map, game mode, restarts", level: 1 },
      { id: "maps", label: "Maps", icon: "🗺️", hint: "Workshop maps by mode", level: 1 },
      { id: "config", label: "Plugin config", icon: "⚙", hint: "Rankings, allocator, game rules", level: 2 },
      { id: "season", label: "Season", icon: "🏆", hint: "Season management, elo reset", level: 3 },
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
    const { t, locale } = useI18n();

  const [tab, setTab] = useState<TabId>("overview");
  const [players, setPlayers] = useState<Player[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [mapInput, setMapInput] = useState("");
  const [log, setLog] = useState<LogEntry[] | null>(null);
  /** What is actually running, so the panel can mark the current answer. */
  const [live, setLive] = useState<{ map: string | null; mode: string | null; players: number | null }>({
    map: null, mode: null, players: null,
  });
  /**
   * The season-end vote, which is the whole of what "the season is over" means
   * here. It comes from the public /api/vote rather than from the server itself
   * because the freeze is a website fact — the poll's own window — and asking
   * the game server about it would cost an RCON round trip to learn something
   * the database already knows.
   */
  const [poll, setPoll] = useState<FreezePoll>(null);

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

  useEffect(() => {
    fetch(`/api/admin/overview${adminKey ? `?key=${encodeURIComponent(adminKey)}` : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => j.live && setLive(j.live))
      .catch(() => {});
  }, [adminKey, toast]);

  // Re-read on every visit to the Server section rather than once on mount, so
  // an owner who has just started the season from the dashboard does not come
  // back to a control that is still greyed out by a freeze that has lifted.
  useEffect(() => {
    if (tab !== "server") return;
    fetch("/api/vote", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setPoll(j.poll ?? null))
      .catch(() => setPoll(null));
  }, [tab]);

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

  // Computed once for the whole Server section: the banner and each disabled
  // flavour have to name the same moment, and formatting them separately is how
  // two parts of one screen end up disagreeing by a minute.
  const frozen = isFrozen(poll);
  const freezeAt = poll?.closesAt ? freezeDate(poll.closesAt, locale) : "";
  const freezeIn = poll?.closesAt ? freezeLeft(poll.closesAt, t) : "";

  return (
    <>
      {toast && <div className={`admin-toast ${toast.ok ? "ok" : "error"}`}>{toast.text}</div>}

      <div className="adm-shell">
      <nav className="adm-nav" aria-label={t("auto.adminpanel.admin_sections")}>
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

        {/* The dashboard carries an Owner-only control, so it needs to know who
            is looking rather than discovering it from a 403 after the click. */}
        {tab === "overview" && <AdminOverview adminKey={adminKey ?? ""} onGo={go} viewerLevel={viewerLevel} />}

        {tab === "players" && (
          <>
            <form
              className="admin-inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                load(q);
              }}
            >
              <label className="sr-only" htmlFor="adm-search">{t("auto.adminpanel.search_players")}</label>
              <input
                id="adm-search"
                className="input"
                value={q}
                placeholder={t("auto.adminpanel.search_by_name_or_steamid64")}
                onChange={(e) => setQ(e.target.value)}
                style={{ maxWidth: 340 }}
              />
              <button className="btn btn-secondary" type="submit">{t("auto.adminpanel.search")}</button>
              {loading && <span className="muted">{t("auto.adminpanel.loading")}</span>}
            </form>

            <div className="adm-scroll">
              <table className="table adm-players">
                <thead>
                  <tr>
                    <th scope="col">{t("auto.adminpanel.player")}</th>
                    <th scope="col">{t("auto.adminpanel.role")}</th>
                    <th scope="col">{t("auto.adminpanel.status")}</th>
                    <th scope="col" className="adm-actions-col">{t("auto.adminpanel.actions")}</th>
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
                          {p.hasOverride && <span className="mini-badge">{t("auto.adminpanel.override")}</span>}
                          <div className="adm-steamid num">{p.steamId}</div>
                        </td>
                        <td>{p.role > 0 ? <span className="role-badge sm">{ROLE_LABEL[p.role]}</span> : "—"}</td>
                        <td>
                          {p.banned ? (
                            <span className="mini-badge danger" title={p.banReason ?? ""}>
                              {t("auto.adminpanel.banned")}{p.banExpires ? "" : " ∞"}
                            </span>
                          ) : (
                            <span className="muted">{t("auto.adminpanel.ok")}</span>
                          )}
                        </td>
                        <td className="adm-actions-col">
                          <div className="adm-actions">
                            {canMod && <button className="btn btn-secondary" onClick={() => doAction({ type: "kick", name: p.steamName })}>{t("auto.adminpanel.kick")}</button>}
                            {canAdmin && <button className="btn btn-secondary" onClick={() => doAction({ type: "slay", name: p.steamName })}>{t("auto.adminpanel.slay")}</button>}
                            {canAdmin && !p.banned && <button className="btn btn-secondary" onClick={() => onBan(p)}>{t("auto.adminpanel.ban")}</button>}
                            {canAdmin && p.banned && <button className="btn btn-secondary" onClick={() => doAction({ type: "unban", steamId: p.steamId })}>{t("auto.adminpanel.unban")}</button>}
                            {canAdmin && <button className="btn btn-ghost" onClick={() => onRename(p)}>{t("auto.adminpanel.rename")}</button>}
                            {canAdmin && p.hasOverride && <button className="btn btn-ghost" onClick={() => doAction({ type: "clearName", steamId: p.steamId })}>{t("auto.adminpanel.reset")}</button>}
                            {canOwner && (
                              <>
                                <label className="sr-only" htmlFor={`role-${p.steamId}`}>{t("auto.adminpanel.role_for")} {p.name}</label>
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
                                  <option value={0}>{t("auto.adminpanel.no_role")}</option>
                                  <option value={1}>{t("auto.adminpanel.moderator")}</option>
                                  <option value={2}>{t("auto.adminpanel.admin")}</option>
                                  <option value={3}>{t("auto.adminpanel.owner")}</option>
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
            {frozen && (
              // Stated above the control rather than only inside the disabled
              // buttons' tooltips, because a tooltip is unreachable on a touch
              // screen and a greyed-out button that cannot say why it is
              // greyed-out reads as a bug. The date and the time remaining are
              // both here: one answers "when", the other answers "how long".
              <div className="adm-freeze" role="status">
                <strong>{t("admin.freeze.title")}</strong>
                <span>{t("admin.freeze.body")}</span>
                <span className="adm-freeze-when">{t("admin.freeze.when", { date: freezeAt, left: freezeIn })}</span>
                {canOwner && (
                  <button 
                    className="btn btn-secondary" 
                    style={{ marginTop: 12, alignSelf: "flex-start" }}
                    onClick={async () => {
                      if (!confirm("Are you sure you want to start the season?")) return;
                      const res = await fetch("/api/admin/rcon", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ command: "!season_start", key: adminKey }),
                      });
                      const data = await res.json();
                      flash(res.ok, res.ok ? "Season started." : data.error ?? "Failed to start season.");
                      if (res.ok) load(q);
                    }}
                  >
                    {t("season.break.start_season")}
                  </button>
                )}
              </div>
            )}

            <section>
              <h3>{t("auto.adminpanel.game_mode")}</h3>
              <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                {t("auto.adminpanel.switches_the_plugin_s_active_m")}
                                                </p>
              {/* Retakes is one mode to the plugin but three different nights
                  to the people playing, so the three share a control: picking
                  between them is one decision. Ranked and competitive need
                  bodies on the server, so they are disabled rather than
                  failing somewhere the admin cannot see. */}
              <div className="adm-flavours" role="group" aria-label={t("auto.adminpanel.retakes")}>
                {RETAKE_FLAVOURS.map((f) => {
                  const short = live.players !== null && live.players < f.minPlayers;
                  const odd = f.evenTeams && live.players !== null && live.players % 2 !== 0;
                  // Classic is the flavour with points off, so it is the one
                  // thing a frozen season does not stop. The other two exist to
                  // move ELO, and ELO does not move until the next season
                  // starts.
                  const paused = frozen && f.id !== "retakes";
                  return (
                    <button
                      key={f.id}
                      className={`adm-flavour ${live.mode === "retakes" && f.id === "retakes" ? "live" : ""} ${paused ? "is-paused is-disabled-hatch" : ""}`}
                      disabled={!canAdmin || paused || short || odd}
                      title={
                        !canAdmin ? "Admin role required"
                        // The freeze is checked before the player counts because
                        // it outranks them: filling the server does not bring
                        // ranked back, and "needs 4 players" would send an admin
                        // chasing the wrong fix.
                        : paused ? t("admin.freeze.flavour_title", { date: freezeAt, left: freezeIn })
                        : short ? `Needs ${f.minPlayers} players — ${live.players} on the server`
                        : odd ? `Needs an even number of players — ${live.players} on the server`
                        : f.hint
                      }
                      onClick={() => doAction({ type: "gamemode", mode: f.id })}
                    >
                      <span className="adm-flavour-name">{f.label}</span>
                      <span className="adm-flavour-hint">
                        {paused ? t("admin.freeze.flavour_hint") : short ? `needs ${f.minPlayers}` : odd ? "needs even teams" : f.hint}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="adm-modes">
                {GAME_MODES.filter((m) => m.id !== "retakes").map((m) => (
                  <button
                    key={m.id}
                    className={`adm-mode ${live.mode === m.id ? "live" : ""}`}
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
              <h3>{t("auto.adminpanel.map")}</h3>
              <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                {t("auto.adminpanel.all_of_these_ship_with_cs2_tra")}
                                                </p>
              {/* Same control as the game modes beside them: these do the same
                  kind of thing and looked like two different features. */}
              <div className="adm-modes">
                {STOCK_MAPS.map((m) => (
                  <button
                    key={m.id}
                    className={`adm-mode adm-map ${live.map === m.id ? "live" : ""}`}
                    title={live.map === m.id ? `${m.label} — running now` : m.id}
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
                <label className="sr-only" htmlFor="adm-map">{t("auto.adminpanel.workshop_or_custom_map")}</label>
                <input
                  id="adm-map"
                  className="input"
                  value={mapInput}
                  placeholder={t("auto.adminpanel.workshop_or_custom_map_name")}
                  onChange={(e) => setMapInput(e.target.value)}
                  style={{ maxWidth: 280 }}
                />
                <button className="btn btn-secondary" type="submit">{t("auto.adminpanel.change_map")}</button>
              </form>
            </section>
          </div>
        )}

        {tab === "config" && canAdmin && <PluginConfigEditor adminKey={adminKey} />}

        {tab === "season" && canOwner && <SeasonManager adminKey={adminKey} />}

        {tab === "console" && canAdmin && <RconConsole adminKey={adminKey} />}

        {tab === "skins" && <SkinManager adminKey={adminKey} canUpload={canAdmin} />}

        {tab === "demos" && canAdmin && <PendingDemos adminKey={adminKey} />}

        {tab === "captures" && canMod && <CaptureSuggestions adminKey={adminKey} />}

        {tab === "safequeue" && canMod && <SafeQueue adminKey={adminKey} />}

        {tab === "maps" && canMod && <MapManager adminKey={adminKey} />}

        {tab === "log" && (
          <div className="adm-scroll">
            {log === null ? (
              <p className="muted">{t("auto.adminpanel.loading")}</p>
            ) : log.length === 0 ? (
              <p className="empty-hint">{t("auto.adminpanel.no_admin_actions_logged_yet")}</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">{t("auto.adminpanel.when_utc")}</th>
                    <th scope="col">{t("auto.adminpanel.actor")}</th>
                    <th scope="col">{t("auto.adminpanel.action")}</th>
                    <th scope="col">{t("auto.adminpanel.target")}</th>
                    <th scope="col">{t("auto.adminpanel.detail")}</th>
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
