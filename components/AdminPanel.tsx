"use client";

import { useCallback, useEffect, useState } from "react";
import AdminNav from "@/components/admin/AdminNav";
import ServerControl from "@/components/admin/ServerControl";
import {
  BLITZ_SECTIONS,
  SITE_SECTIONS,
  findItem,
  panelsFor,
  tabIds,
  visibleSections,
  type AdminPanelId,
  type AdminViewer,
} from "@/components/admin/adminSections";
import SkinManager from "@/components/admin/SkinManager";
import PluginConfigEditor from "@/components/admin/PluginConfigEditor";
import SeasonManager from "@/components/admin/SeasonManager";
import PendingDemos from "@/components/admin/PendingDemos";
import AdminOverview from "@/components/admin/AdminOverview";
import CaptureSuggestions from "@/components/admin/CaptureSuggestions";
import SafeQueue from "@/components/admin/SafeQueue";
import MapManager from "@/components/admin/MapManager";
import GameMaker from "@/components/admin/GameMaker";
import { useI18n } from '@/components/I18nProvider';

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

/** A tab id. Checked against the panel's own section list, not a union —
 *  the list is data now, and a union here would be a second copy of it. */
type TabId = string;

const ROLE_LABEL = ["—", "Moderator", "Admin", "Owner"];

export default function AdminPanel({
  viewerLevel,
  adminKey,
  panel = "site",
  isOrganizer = false,
  managesSome = false,
}: {
  viewerLevel: number;
  adminKey?: string;
  /**
   * Which of the two panels this is.
   *
   * Defaulted rather than required so every existing call site keeps meaning
   * what it meant: /admin was the whole panel before there were two, and a
   * default of "blitz" would have silently narrowed it.
   */
  panel?: AdminPanelId;
  /** In the organizer registry — may run events of their own. */
  isOrganizer?: boolean;
  /** Named on somebody else's event without being in the registry. */
  managesSome?: boolean;
}) {
    const { t, locale } = useI18n();

  const [tab, setTab] = useState<TabId>("overview");
  const [players, setPlayers] = useState<Player[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [log, setLog] = useState<LogEntry[] | null>(null);

  const canMod = viewerLevel >= 1;
  const canAdmin = viewerLevel >= 2;
  const canOwner = viewerLevel >= 3;

  // Which panel this is, and therefore which list of sections. The two are
  // separate grants: Blitz is the one an organizer with no admin level at all
  // can open, so it must never be reached by falling through from the other.
  const sections = panel === "blitz" ? BLITZ_SECTIONS : SITE_SECTIONS;

  const viewer: AdminViewer = { level: viewerLevel, isOrganizer, managesSome };

  // Filtering lives in adminSections so a caller cannot forget the gate by
  // forgetting to pass a flag.
  const visible = visibleSections(sections, viewer);
  const current = findItem(sections, tab);

  // The open section lives in the URL, so a reload — or a link to someone —
  // lands where it should.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("tab");
    if (wanted && tabIds(sections).includes(wanted)) setTab(wanted);
  }, [sections]);

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

  // Computed once for the whole Server section: the banner and each disabled
  // flavour have to name the same moment, and formatting them separately is how
  // two parts of one screen end up disagreeing by a minute.

  return (
    <>
      {toast && <div className={`admin-toast ${toast.ok ? "ok" : "error"}`}>{toast.text}</div>}

      <div className="adm-shell">
      <AdminNav
        panel={panel}
        panels={panelsFor(viewer)}
        groups={visible}
        active={tab}
        onSelect={go}
        counts={{ players: players.length }}
        keyQuery={adminKey ? `?key=${encodeURIComponent(adminKey)}` : ""}
        label={t("auto.adminpanel.admin_sections")}
      />

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

        {/* One surface for the fleet. Console used to be a tab of its own,
            which meant running a command in one place and going somewhere else
            to find out what it did. */}
        {tab === "server" && canMod && <ServerControl adminKey={adminKey} />}

        {tab === "config" && canAdmin && <PluginConfigEditor adminKey={adminKey} />}

        {tab === "season" && canOwner && <SeasonManager adminKey={adminKey} />}

        {tab === "skins" && <SkinManager adminKey={adminKey} canUpload={canAdmin} />}

        {tab === "demos" && canAdmin && <PendingDemos adminKey={adminKey} />}

        {tab === "captures" && canMod && <CaptureSuggestions adminKey={adminKey} />}

        {tab === "safequeue" && canMod && <SafeQueue adminKey={adminKey} />}

        {tab === "maps" && canMod && <MapManager adminKey={adminKey} />}

        {tab === "gamemaker" && canAdmin && <GameMaker adminKey={adminKey} />}

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
