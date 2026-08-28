"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import "./setup.css";
import StatusTag from "./StatusTag";

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
  /** The API has always returned this; nothing displayed or edited it. */
  isTournament: boolean;
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

/** One tournament's unsaved add-stage form. */
type StageDraft = { name: string; kind: string; bestOf: string; finalBestOf: string };

const NEW_STAGE: StageDraft = { name: "Playoffs", kind: "single", bestOf: "1", finalBestOf: "" };

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

  // Which server row is being edited, and its draft. One at a time: editing two
  // rows at once has no use here and doubles the ways the table can be wrong.
  const [editingServer, setEditingServer] = useState<number | null>(null);
  const [srvEdit, setSrvEdit] = useState({ name: "", host: "", port: "", rconPassword: "", isTournament: true });
  /** Delete asks twice. The row is small and the action is not undoable. */
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  /** The freshly minted organizer link, shown once so it can be copied. */
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  /* Built in the browser rather than passed down: this component is already a
     client component and the origin is whatever host is serving the page, which
     is the one thing a hardcoded URL always gets wrong on a preview deploy. */
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const [tName, setTName] = useState("");
  const [tTeamSize, setTTeamSize] = useState("3");
  const [tMaxTeams, setTMaxTeams] = useState("16");
  /**
   * The add-stage draft, per tournament.
   *
   * This used to be a single object shared by every tournament in the list,
   * while the form that edits it is rendered inside `tournaments.map()` — so
   * typing a stage name under one tournament visibly rewrote the field under
   * all the others. Keyed by id, exactly like `coOrganizer` above, which had
   * the shape right all along.
   *
   * The old object also carried a `tournamentId` that was initialised to 0 and
   * never read: the submit handler takes `tr.id` from the closure. Gone.
   */
  const [stage, setStage] = useState<Record<number, StageDraft>>({});

  const stageOf = (id: number): StageDraft => stage[id] ?? NEW_STAGE;
  const setStageOf = (id: number, patch: Partial<StageDraft>) =>
    setStage((s) => ({ ...s, [id]: { ...stageOf(id), ...patch } }));

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
          /* Scrolls inside itself on a narrow screen rather than widening the
             page — an address column alone is wider than a phone. */
          <div className="pro-tablewrap">
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
                  <td>
                    {editingServer === s.id ? (
                      <input
                        id={`su-srv-name-${s.id}`}
                        aria-label={t("setup.serverName")}
                        className="su-narrow-wide"
                        value={srvEdit.name}
                        onChange={(e) => setSrvEdit({ ...srvEdit, name: e.target.value })}
                      />
                    ) : (
                      s.name
                    )}
                  </td>
                  <td className="muted">
                    {editingServer === s.id ? (
                      <span className="su-inline">
                        <input
                          id={`su-srv-host-${s.id}`}
                          aria-label={t("setup.host")}
                          value={srvEdit.host}
                          onChange={(e) => setSrvEdit({ ...srvEdit, host: e.target.value })}
                        />
                        <input
                          id={`su-srv-port-${s.id}`}
                          aria-label={t("setup.port")}
                          className="su-narrow"
                          value={srvEdit.port}
                          onChange={(e) => setSrvEdit({ ...srvEdit, port: e.target.value })}
                        />
                      </span>
                    ) : (
                      `${s.host}:${s.port}`
                    )}
                  </td>
                  <td>
                    <StatusTag kind="server" value={s.status} />
                  </td>
                  <td>
                    {editingServer === s.id ? (
                      <>
                        {/* Left blank the password is untouched — the route
                            only overwrites it when a new one is supplied, so
                            saving a renamed server cannot blank it. */}
                        <input
                          id={`su-srv-pw-${s.id}`}
                          aria-label={t("setup.rconUnchanged")}
                          className="su-narrow-wide"
                          type="password"
                          autoComplete="new-password"
                          placeholder={t("setup.rconUnchanged")}
                          value={srvEdit.rconPassword}
                          onChange={(e) => setSrvEdit({ ...srvEdit, rconPassword: e.target.value })}
                        />
                        <button
                          className="btn btn-primary su-small"
                          disabled={busy}
                          onClick={async () => {
                            await post(
                              "/api/admin/servers",
                              {
                                action: "update",
                                id: s.id,
                                name: srvEdit.name,
                                host: srvEdit.host,
                                port: Number(srvEdit.port) || undefined,
                                rconPassword: srvEdit.rconPassword || undefined,
                                isTournament: srvEdit.isTournament,
                              },
                              `save ${s.name}`,
                            );
                            setEditingServer(null);
                          }}
                        >
                          {t("setup.save")}
                        </button>
                        <button className="btn su-small" onClick={() => setEditingServer(null)}>
                          {t("setup.cancel")}
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn su-small" disabled={busy} onClick={() => post("/api/admin/servers", { action: "test", id: s.id }, `test ${s.name}`)}>
                          {t("setup.test")}
                        </button>

                        {isOwner && (
                          <button
                            className="btn su-small"
                            disabled={busy}
                            onClick={() => {
                              setSrvEdit({
                                name: s.name,
                                host: s.host,
                                port: String(s.port),
                                // Never prefilled: GET does not return it, and a
                                // box that looks filled would invite saving a
                                // placeholder over a working password.
                                rconPassword: "",
                                isTournament: s.isTournament,
                              });
                              setEditingServer(s.id);
                            }}
                          >
                            {t("setup.edit")}
                          </button>
                        )}

                        {isOwner && (
                          <button
                            className="btn su-small"
                            disabled={busy}
                            onClick={() => post("/api/admin/servers", { action: "duplicate", id: s.id }, `duplicate ${s.name}`)}
                            title={t("setup.duplicateHint")}
                          >
                            {t("setup.duplicate")}
                          </button>
                        )}

                        {isOwner && s.currentMatchId !== null && (
                          <button className="btn su-small" disabled={busy} onClick={() => post("/api/admin/servers", { action: "release", id: s.id }, `release ${s.name}`)}>
                            {t("setup.release")}
                          </button>
                        )}

                        {/* Two-step rather than a confirm() — a modal dialog
                            blocks the whole tab and this is a table row. */}
                        {isOwner && (
                          confirmDelete === s.id ? (
                            <>
                              <button
                                className="btn su-small su-danger"
                                disabled={busy}
                                onClick={async () => {
                                  await post("/api/admin/servers", { action: "delete", id: s.id }, `delete ${s.name}`);
                                  setConfirmDelete(null);
                                }}
                              >
                                {t("setup.confirmDelete")}
                              </button>
                              <button className="btn su-small" onClick={() => setConfirmDelete(null)}>
                                {t("setup.cancel")}
                              </button>
                            </>
                          ) : (
                            <button className="btn su-small" disabled={busy} onClick={() => setConfirmDelete(s.id)}>
                              {t("setup.delete")}
                            </button>
                          )
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
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

          {/* The other way in, and the one people will actually use.
              Adding an organizer by SteamID64 means asking somebody for a
              17-digit number, being sent a profile URL instead, and looking it
              up. A link skips all of it: whoever clicks it proves who they are
              by signing in with Steam, so the link carries no identity and can
              be handed to somebody without knowing anything about them. */}
          <div className="su-invite">
            <div className="su-row">
              <button
                className="btn"
                disabled={busy}
                onClick={async () => {
                  const done = await post(
                    "/api/admin/organizers/invite",
                    { action: "create", kind: "registry" },
                    "organizer invite",
                  );
                  if (done?.token) setInviteLink(`${origin}/organizers/join?invite=${done.token}`);
                }}
              >
                {t("organizerInvite.create")}
              </button>
            </div>

            {inviteLink && (
              <div className="su-invite-out">
                <code className="su-invite-link">{inviteLink}</code>
                <button
                  className="btn su-small"
                  onClick={() => navigator.clipboard?.writeText(inviteLink)}
                >
                  {t("commands.copy")}
                </button>
                <span className="muted">{t("organizerInvite.unused")}</span>
              </div>
            )}
          </div>

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
            const done = await post(
              "/api/admin/tournaments",
              {
                action: "create",
                name: tName.trim(),
                teamSize: Number(tTeamSize) || 3,
                maxTeams: Number(tMaxTeams) || 16,
              },
              "create",
            );
            if (done?.ok) setTName("");
          }}
        >
          <input value={tName} onChange={(e) => setTName(e.target.value)} placeholder={t("setup.tournamentName")} />

          {/* Asked here rather than defaulted silently. Both were fixed at 3v3
              and sixteen teams, which is a reasonable guess and the wrong one
              often enough that an organizer had to go and find the settings
              page immediately after creating. */}
          <label className="su-field">
            <span>{t("setup.teamSizeLabel")}</span>
            <select value={tTeamSize} onChange={(e) => setTTeamSize(e.target.value)}>
              <option value="2">2v2</option>
              <option value="3">3v3</option>
              <option value="5">5v5</option>
            </select>
          </label>

          <label className="su-field">
            <span>{t("setup.maxTeamsLabel")}</span>
            <input
              type="number"
              min={2}
              max={128}
              value={tMaxTeams}
              onChange={(e) => setTMaxTeams(e.target.value)}
            />
          </label>
          <button className="btn btn-primary" disabled={busy || tName.trim().length < 2}>
            {t("setup.create")}
          </button>
        </form>

        {tournaments.map((tr) => (
          <div key={tr.id} className="su-tournament">
            <div className="su-row">
              <strong>{tr.name}</strong>
              <StatusTag kind="tournament" value={tr.state} />
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

            {/* Every control is templated by tournament id — both the value it
                reads and the id it carries. Placeholder-only inputs had no
                accessible name at all before this. */}
            <form
              className="su-row su-stage"
              onSubmit={async (e) => {
                e.preventDefault();
                const draft = stageOf(tr.id);
                await post(
                  "/api/admin/tournaments",
                  {
                    action: "add-stage",
                    tournamentId: tr.id,
                    stageName: draft.name,
                    kind: draft.kind,
                    bestOf: Number(draft.bestOf) || 1,
                    finalBestOf: draft.finalBestOf ? Number(draft.finalBestOf) : undefined,
                  },
                  "add stage",
                );
              }}
            >
              <label className="su-inline-label" htmlFor={`su-stage-name-${tr.id}`}>
                {t("setup.stageName")}
              </label>
              <input
                id={`su-stage-name-${tr.id}`}
                value={stageOf(tr.id).name}
                onChange={(e) => setStageOf(tr.id, { name: e.target.value })}
                placeholder={t("setup.stageName")}
              />

              <select
                id={`su-stage-kind-${tr.id}`}
                aria-label={t("setup.stageKind")}
                value={stageOf(tr.id).kind}
                onChange={(e) => setStageOf(tr.id, { kind: e.target.value })}
              >
                <option value="single">single elim</option>
                <option value="group">group</option>
                <option value="swiss">swiss</option>
              </select>

              <input
                id={`su-stage-bo-${tr.id}`}
                aria-label={t("setup.bo")}
                value={stageOf(tr.id).bestOf}
                onChange={(e) => setStageOf(tr.id, { bestOf: e.target.value })}
                className="su-narrow"
                placeholder="BO"
              />
              <input
                id={`su-stage-finalbo-${tr.id}`}
                aria-label={t("setup.finalBo")}
                value={stageOf(tr.id).finalBestOf}
                onChange={(e) => setStageOf(tr.id, { finalBestOf: e.target.value })}
                className="su-narrow"
                placeholder={t("setup.finalBo")}
              />
              <button className="btn su-small" disabled={busy}>{t("setup.addStage")}</button>
            </form>
          </div>
        ))}
      </section>

      {log.length > 0 && <pre className="su-log">{log.join("\n")}</pre>}
    </div>
  );
}
