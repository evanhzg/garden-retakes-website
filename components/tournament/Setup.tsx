"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import "./setup.css";

// Everything needed to get from an empty database to a match on a server.
//
// One page rather than four, because the steps are ordered and the order is not
// obvious: a server has to exist before a match can claim one, a tournament
// before a stage, teams before a bracket. Doing them in one place, top to
// bottom, is the difference between a setup somebody can follow and a set of
// endpoints they have to already know about.

type Server = {
  id: number;
  name: string;
  host: string;
  port: number;
  status: string;
  currentMatchId: number | null;
};

type Organizer = { steamId: string; name: string; isCreator?: boolean };
type Tournament = {
  id: number;
  name: string;
  slug: string;
  state: string;
  teams: number;
  stages: Stage[];
  organizers: Organizer[];
};
type Stage = { id: number; name: string; kind: string; bestOf: number; matches: number };

const DEFAULT_POOL = ["de_dust2", "de_inferno", "de_cache", "de_anubis", "de_mirage", "de_ancient", "de_nuke"];

export default function Setup({ adminKey, isOwner }: { adminKey?: string; isOwner: boolean }) {
  const { t } = useI18n();

  const [servers, setServers] = useState<Server[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // The global registry: who may create a tournament at all. Separate from the
  // per-tournament lists below, which say who may run a given one.
  const [registry, setRegistry] = useState<Organizer[]>([]);
  const [canEditRegistry, setCanEditRegistry] = useState(false);
  const [newOrganizer, setNewOrganizer] = useState({ steamId: "", name: "" });
  const [coOrganizer, setCoOrganizer] = useState<Record<number, string>>({});

  const [srv, setSrv] = useState({ name: "", host: "", port: "27015", rconPassword: "", connectAddress: "" });
  const [tName, setTName] = useState("");
  const [stage, setStage] = useState({ tournamentId: 0, name: "Playoffs", kind: "single", bestOf: "1", finalBestOf: "" });

  const say = (line: string) => setLog((l) => [line, ...l].slice(0, 30));

  const load = useCallback(async () => {
    const q = adminKey ? `?key=${encodeURIComponent(adminKey)}` : "";

    try {
      const [s, tr, org] = await Promise.all([
        fetch(`/api/admin/servers${q}`, { cache: "no-store" }).then((r) => r.json()),
        fetch(`/api/admin/tournaments/list${q}`, { cache: "no-store" }).then((r) => r.json()),
        fetch(`/api/admin/organizers${q}`, { cache: "no-store" }).then((r) => r.json()),
      ]);

      setServers(s.servers ?? []);
      setTournaments(tr.tournaments ?? []);
      setRegistry(org.organizers ?? []);
      setCanEditRegistry(Boolean(org.canEdit));
    } catch {
      // A failed refresh is a stale list; the next action reloads it.
    }
  }, [adminKey]);

  useEffect(() => {
    load();
  }, [load]);

  const post = useCallback(
    async (url: string, body: Record<string, unknown>, label: string) => {
      setBusy(true);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...body, key: adminKey }),
        });

        const data = await res.json();
        say(`${label} → ${data.error ?? data.reply ?? (data.ok ? "ok" : JSON.stringify(data))}`);

        await load();
        return data;
      } catch (err) {
        say(`${label} → ${String(err)}`);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [adminKey, load],
  );

  return (
    <div className="su">
      <section className="su-step">
        <h3>
          <span className="su-n">1</span> {t("setup.servers")}
        </h3>

        {!isOwner ? (
          <p className="muted">{t("setup.ownerOnly")}</p>
        ) : (
          <>
            <p className="muted">{t("setup.serversBlurb")}</p>

            <div className="su-row">
              <button
                className="btn"
                disabled={busy}
                onClick={() => post("/api/admin/servers", { action: "seed-from-env" }, "seed from env")}
              >
                {t("setup.seedFromEnv")}
              </button>
            </div>

            <form
              className="su-row"
              onSubmit={async (e) => {
                e.preventDefault();
                const done = await post(
                  "/api/admin/servers",
                  { action: "add", ...srv, port: Number(srv.port) || 27015 },
                  "add server",
                );
                if (done?.ok) setSrv({ name: "", host: "", port: "27015", rconPassword: "", connectAddress: "" });
              }}
            >
              <input value={srv.name} onChange={(e) => setSrv({ ...srv, name: e.target.value })} placeholder={t("setup.serverName")} />
              <input value={srv.host} onChange={(e) => setSrv({ ...srv, host: e.target.value })} placeholder="host" />
              <input value={srv.port} onChange={(e) => setSrv({ ...srv, port: e.target.value })} placeholder="27015" className="su-narrow" />
              <input
                type="password"
                value={srv.rconPassword}
                onChange={(e) => setSrv({ ...srv, rconPassword: e.target.value })}
                placeholder={t("setup.rconPassword")}
              />
              <input
                value={srv.connectAddress}
                onChange={(e) => setSrv({ ...srv, connectAddress: e.target.value })}
                placeholder={t("setup.connectAddress")}
              />
              <button className="btn btn-primary" disabled={busy || !srv.name || !srv.host || !srv.rconPassword}>
                {t("setup.addServer")}
              </button>
            </form>
          </>
        )}

        {servers.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>{t("setup.serverName")}</th>
                <th>{t("setup.address")}</th>
                <th>{t("tournaments.state")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {servers.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td className="muted">{s.host}:{s.port}</td>
                  <td>
                    <span className={`chip su-${s.status}`}>{s.status}</span>
                  </td>
                  <td>
                    <button className="btn su-small" disabled={busy} onClick={() => post("/api/admin/servers", { action: "test", id: s.id }, `test ${s.name}`)}>
                      {t("setup.test")}
                    </button>
                    {isOwner && s.currentMatchId !== null && (
                      <button className="btn su-small" disabled={busy} onClick={() => post("/api/admin/servers", { action: "release", id: s.id }, `release ${s.name}`)}>
                        {t("setup.release")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* The registry is only interesting to somebody who can change it —
          an organizer reading a list they cannot edit learns nothing they did
          not already know by being on it. */}
      {canEditRegistry && (
        <section className="su-step">
          <h3>
            <span className="su-n">2</span> {t("setup.organizers")}
          </h3>

          <p className="muted">{t("setup.organizersBlurb")}</p>

          <form
            className="su-row"
            onSubmit={async (e) => {
              e.preventDefault();
              const done = await post(
                "/api/admin/organizers",
                { action: "add", steamId: newOrganizer.steamId.trim(), name: newOrganizer.name.trim() },
                "add organizer",
              );
              if (done?.ok) setNewOrganizer({ steamId: "", name: "" });
            }}
          >
            <input
              value={newOrganizer.steamId}
              onChange={(e) => setNewOrganizer({ ...newOrganizer, steamId: e.target.value })}
              placeholder="SteamID64"
              inputMode="numeric"
            />
            <input
              value={newOrganizer.name}
              onChange={(e) => setNewOrganizer({ ...newOrganizer, name: e.target.value })}
              placeholder={t("setup.serverName")}
            />
            <button className="btn btn-primary" disabled={busy || !/^\d{17}$/.test(newOrganizer.steamId.trim())}>
              {t("setup.addOrganizer")}
            </button>
          </form>

          {registry.length === 0 ? (
            <p className="muted">{t("setup.noOrganizers")}</p>
          ) : (
            <div className="su-row su-wrap">
              {registry.map((o) => (
                <span key={o.steamId} className="su-organizer">
                  <a href={`/players/${o.steamId}`}>{o.name || o.steamId}</a>
                  <button
                    className="su-x"
                    type="button"
                    disabled={busy}
                    aria-label={t("setup.removeOrganizer")}
                    title={t("setup.removeOrganizer")}
                    onClick={() => post("/api/admin/organizers", { action: "remove", steamId: o.steamId }, "remove organizer")}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="su-step">
        <h3>
          <span className="su-n">3</span> {t("setup.tournament")}
        </h3>

        <form
          className="su-row"
          onSubmit={async (e) => {
            e.preventDefault();
            const done = await post("/api/admin/tournaments", { action: "create", name: tName.trim() }, "create");
            if (done?.ok) setTName("");
          }}
        >
          <input value={tName} onChange={(e) => setTName(e.target.value)} placeholder={t("setup.tournamentName")} />
          <button className="btn btn-primary" disabled={busy || tName.trim().length < 2}>
            {t("setup.create")}
          </button>
        </form>

        {tournaments.map((tr) => (
          <div key={tr.id} className="su-tournament">
            <div className="su-row">
              <strong>{tr.name}</strong>
              <span className="chip">{tr.state}</span>
              <span className="muted">{tr.teams} {t("tournaments.teams").toLowerCase()}</span>

              <a className="btn su-small" href={`/tournaments/${tr.slug}/register`}>{t("setup.registerLink")}</a>
              <a className="btn su-small" href={`/admin/tournaments/${tr.id}${adminKey ? `?key=${adminKey}` : ""}`}>
                {t("setup.panel")}
              </a>

              <button
                className="btn su-small"
                disabled={busy}
                onClick={() => post("/api/admin/tournaments", { action: "set-pool", tournamentId: tr.id, maps: DEFAULT_POOL }, "set pool")}
              >
                {t("setup.setPool")}
              </button>

              <button
                className="btn su-small"
                disabled={busy}
                onClick={() => post("/api/admin/tournaments", { action: "state", tournamentId: tr.id, state: tr.state === "registration" ? "live" : "registration" }, "state")}
              >
                {tr.state === "registration" ? t("setup.closeReg") : t("setup.openReg")}
              </button>
            </div>

            {/* Who runs this one. An organizer can bring in a co-organizer
                themselves — needing an admin for it would make every co-host a
                support request. The last one cannot be removed; the server
                refuses it rather than leaving an event nobody can reach. */}
            <div className="su-row su-stage su-wrap">
              <span className="muted">{t("setup.runBy")}</span>

              {tr.organizers.length === 0 && <span className="muted">{t("setup.noOrganizers")}</span>}

              {tr.organizers.map((o) => (
                <span key={o.steamId} className="su-organizer">
                  <a href={`/players/${o.steamId}`}>{o.name || o.steamId}</a>
                  {o.isCreator && <span className="su-creator" title={t("setup.creator")}>★</span>}
                  <button
                    className="su-x"
                    type="button"
                    disabled={busy || tr.organizers.length <= 1}
                    aria-label={t("setup.removeOrganizer")}
                    title={tr.organizers.length <= 1 ? t("setup.lastOrganizer") : t("setup.removeOrganizer")}
                    onClick={() =>
                      post(
                        "/api/admin/tournaments",
                        { action: "remove-organizer", tournamentId: tr.id, steamId: o.steamId },
                        "remove organizer",
                      )
                    }
                  >
                    ×
                  </button>
                </span>
              ))}

              <form
                className="su-inline"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const steamId = (coOrganizer[tr.id] ?? "").trim();
                  const done = await post(
                    "/api/admin/tournaments",
                    { action: "add-organizer", tournamentId: tr.id, steamId },
                    "add co-organizer",
                  );
                  if (done?.ok) setCoOrganizer((c) => ({ ...c, [tr.id]: "" }));
                }}
              >
                <input
                  value={coOrganizer[tr.id] ?? ""}
                  onChange={(e) => setCoOrganizer((c) => ({ ...c, [tr.id]: e.target.value }))}
                  placeholder="SteamID64"
                  inputMode="numeric"
                  className="su-narrow-id"
                />
                <button
                  className="btn su-small"
                  disabled={busy || !/^\d{17}$/.test((coOrganizer[tr.id] ?? "").trim())}
                >
                  {t("setup.addCoOrganizer")}
                </button>
              </form>
            </div>

            {tr.stages.map((st) => (
              <div key={st.id} className="su-row su-stage">
                <span>{st.name}</span>
                <span className="muted">{st.kind} · BO{st.bestOf}</span>
                <span className="muted">{st.matches} {t("tournamentAdmin.matches").toLowerCase()}</span>

                <button
                  className="btn su-small"
                  disabled={busy || st.matches > 0}
                  title={st.matches > 0 ? t("setup.alreadyGenerated") : ""}
                  onClick={() => post("/api/admin/tournaments", { action: "generate", stageId: st.id }, `generate ${st.name}`)}
                >
                  {t("setup.generate")}
                </button>
              </div>
            ))}

            <form
              className="su-row su-stage"
              onSubmit={async (e) => {
                e.preventDefault();
                await post(
                  "/api/admin/tournaments",
                  {
                    action: "add-stage",
                    tournamentId: tr.id,
                    stageName: stage.name,
                    kind: stage.kind,
                    bestOf: Number(stage.bestOf) || 1,
                    finalBestOf: stage.finalBestOf ? Number(stage.finalBestOf) : undefined,
                  },
                  "add stage",
                );
              }}
            >
              <input value={stage.name} onChange={(e) => setStage({ ...stage, name: e.target.value })} placeholder={t("setup.stageName")} />
              <select value={stage.kind} onChange={(e) => setStage({ ...stage, kind: e.target.value })}>
                <option value="single">single elim</option>
                <option value="group">group</option>
                <option value="swiss">swiss</option>
              </select>
              <input value={stage.bestOf} onChange={(e) => setStage({ ...stage, bestOf: e.target.value })} className="su-narrow" placeholder="BO" />
              <input value={stage.finalBestOf} onChange={(e) => setStage({ ...stage, finalBestOf: e.target.value })} className="su-narrow" placeholder={t("setup.finalBo")} />
              <button className="btn su-small" disabled={busy}>{t("setup.addStage")}</button>
            </form>
          </div>
        ))}
      </section>

      {log.length > 0 && <pre className="su-log">{log.join("\n")}</pre>}
    </div>
  );
}
