"use client";

import { useCallback, useEffect, useState } from "react";
import RconConsole from "@/components/RconConsole";

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

const ROLE_LABEL = ["—", "Moderator", "Admin", "Owner"];
const MAPS = ["de_mirage", "de_inferno", "de_nuke", "de_ancient", "de_dust2", "de_anubis", "de_overpass", "de_vertigo"];

export default function AdminPanel({
  viewerLevel,
  adminKey,
}: {
  viewerLevel: number;
  adminKey?: string;
}) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [mapInput, setMapInput] = useState("");

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

  const canMod = viewerLevel >= 1;
  const canAdmin = viewerLevel >= 2;
  const canOwner = viewerLevel >= 3;

  return (
    <>
      {toast && (
        <div className={`admin-toast ${toast.ok ? "ok" : "error"}`}>{toast.text}</div>
      )}

      {/* ---------- Map change ---------- */}
      <section className="panel">
        <h2>Map</h2>
        <div className="rcon-quick" style={{ marginBottom: 12 }}>
          {MAPS.map((m) => (
            <button key={m} type="button" className="chip" onClick={() => doAction({ type: "map", map: m })}>
              {m}
            </button>
          ))}
        </div>
        <form
          className="admin-inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (mapInput.trim()) doAction({ type: "map", map: mapInput });
          }}
        >
          <input
            className="input"
            value={mapInput}
            placeholder="workshop or custom map name"
            onChange={(e) => setMapInput(e.target.value)}
            style={{ maxWidth: 280 }}
          />
          <button className="btn secondary" type="submit">
            Change map
          </button>
        </form>
      </section>

      {/* ---------- Players ---------- */}
      <section className="panel">
        <h2>Players</h2>
        <form
          className="admin-inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            load(q);
          }}
        >
          <input
            className="input"
            value={q}
            placeholder="Search by name or SteamID64…"
            onChange={(e) => setQ(e.target.value)}
            style={{ maxWidth: 340 }}
          />
          <button className="btn secondary" type="submit">
            Search
          </button>
          {loading && <span className="muted">Loading…</span>}
        </form>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Role</th>
                <th>Status</th>
                <th className="actions-col">Actions</th>
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
                      <a href={`/players/${p.steamId}`} className="admin-pname">
                        {p.name}
                      </a>
                      {p.hasOverride && <span className="mini-badge">override</span>}
                      <div className="admin-steamid">{p.steamId}</div>
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
                    <td className="actions-col">
                      <div className="admin-actions">
                        {canMod && (
                          <button className="btn small" onClick={() => doAction({ type: "kick", name: p.steamName })}>
                            Kick
                          </button>
                        )}
                        {canAdmin && (
                          <button className="btn small" onClick={() => doAction({ type: "slay", name: p.steamName })}>
                            Slay
                          </button>
                        )}
                        {canAdmin && !p.banned && (
                          <button className="btn small danger" onClick={() => onBan(p)}>
                            Ban
                          </button>
                        )}
                        {canAdmin && p.banned && (
                          <button className="btn small" onClick={() => doAction({ type: "unban", steamId: p.steamId })}>
                            Unban
                          </button>
                        )}
                        {canAdmin && (
                          <button className="btn small secondary" onClick={() => onRename(p)}>
                            Rename
                          </button>
                        )}
                        {canAdmin && p.hasOverride && (
                          <button className="btn small secondary" onClick={() => doAction({ type: "clearName", steamId: p.steamId })}>
                            Reset name
                          </button>
                        )}
                        {canOwner && (
                          <select
                            className="input role-select"
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
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------- RCON ---------- */}
      {canAdmin && (
        <section className="panel">
          <h2>RCON console</h2>
          <RconConsole adminKey={adminKey} />
        </section>
      )}
    </>
  );
}
