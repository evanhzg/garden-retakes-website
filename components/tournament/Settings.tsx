"use client";

import { useCallback, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { formatRemaining, TEAM_SIZES } from "@/lib/tournament/edition";
import "./settings.css";

// Everything an organizer decides before a tournament runs.
//
// One panel rather than a wizard: these are not steps, they are settings, and
// an organizer coming back to change the map pool three days later should not
// have to walk past six screens about team size to reach it.
//
// The split that matters is what freezes on start. Format, seeding and series
// length shape the bracket, so they are disabled the moment it exists — shown
// disabled rather than hidden, because "why can I not change this" is a
// question the page should answer rather than provoke.

export type SettingsView = {
  id: number;
  slug: string;
  name: string;
  description: string;
  state: string;
  published: boolean;
  visibility: "public" | "invite";
  inviteToken: string | null;
  maxTeams: number;
  teamSize: number;
  teamCount: number;
  format: string;
  seeding: string;
  bestOf: number;
  finalBestOf: number | null;
  startsAt: string | null;
  startedAt: string | null;
  maps: string[];
  rulesText: string;
  prizeText: string;
  sponsorsText: string;
  discordUrl: string;
  teamSpeakUrl: string;
  twitchChannels: string;
};

export type LibraryMap = { name: string; label: string };

const FORMATS = [
  { id: "single", label: "Single elimination" },
  { id: "double", label: "Double elimination" },
  { id: "group", label: "Groups (round robin)" },
  { id: "swiss", label: "Swiss" },
];

const SEEDINGS = [
  { id: "random", label: "Random", hint: "Shuffled at start." },
  { id: "faceit", label: "FACEIT level", hint: "Team average, strongest seeded first. Unranked teams seed last." },
  { id: "manual", label: "Manual", hint: "Registration order, which you can rearrange." },
];

/** A datetime-local input wants "YYYY-MM-DDTHH:mm" in LOCAL time. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function Settings({
  tournament,
  library,
  adminKey,
  origin,
}: {
  tournament: SettingsView;
  library: LibraryMap[];
  adminKey?: string;
  origin: string;
}) {
  const { t } = useI18n();

  const [form, setForm] = useState({
    name: tournament.name,
    description: tournament.description,
    visibility: tournament.visibility,
    maxTeams: String(tournament.maxTeams),
    teamSize: String(tournament.teamSize),
    format: tournament.format,
    seeding: tournament.seeding,
    bestOf: String(tournament.bestOf),
    finalBestOf: tournament.finalBestOf === null ? "" : String(tournament.finalBestOf),
    startsAt: toLocalInput(tournament.startsAt),
    rulesText: tournament.rulesText,
    prizeText: tournament.prizeText,
    sponsorsText: tournament.sponsorsText,
    discordUrl: tournament.discordUrl,
    teamSpeakUrl: tournament.teamSpeakUrl,
    twitchChannels: tournament.twitchChannels,
  });

  const [maps, setMaps] = useState<string[]>(tournament.maps);
  const [inviteToken, setInviteToken] = useState(tournament.inviteToken);
  const [published, setPublished] = useState(tournament.published);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const started = tournament.startedAt !== null;

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setNotice(null);

      try {
        const res = await fetch("/api/admin/tournaments/settings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...body, tournamentId: tournament.id, key: adminKey }),
        });

        const data = await res.json();
        setNotice(data.error ?? t("settings.saved"));
        return data;
      } catch (err) {
        setNotice(String(err));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [adminKey, tournament.id, t],
  );

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const toggleMap = (name: string) =>
    setMaps((current) =>
      current.includes(name) ? current.filter((m) => m !== name) : [...current, name],
    );

  const save = () =>
    post({
      action: "save",
      name: form.name,
      description: form.description,
      visibility: form.visibility,
      maxTeams: Number(form.maxTeams) || tournament.maxTeams,
      teamSize: Number(form.teamSize) || tournament.teamSize,
      // Only sent while they can still be changed, so a save of the rules text
      // after the start does not trip the server's format guard.
      ...(started
        ? {}
        : {
            format: form.format,
            seeding: form.seeding,
            bestOf: Number(form.bestOf) || 1,
            finalBestOf: form.finalBestOf === "" ? null : Number(form.finalBestOf),
          }),
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
      maps,
      rulesText: form.rulesText,
      prizeText: form.prizeText,
      sponsorsText: form.sponsorsText,
      discordUrl: form.discordUrl,
      teamSpeakUrl: form.teamSpeakUrl,
      twitchChannels: form.twitchChannels,
    });

  const inviteUrl =
    inviteToken && `${origin}/tournaments/${tournament.slug}/register?invite=${inviteToken}`;

  return (
    <div className="ts">
      {notice && <p className="ts-notice">{notice}</p>}

      {/* State first: what this tournament IS right now, and the two buttons
          that change it. Everything below is detail by comparison. */}
      <section className="ts-block ts-state">
        <div className="ts-state-line">
          <span className={`chip ${published ? "ts-live" : "ts-draft"}`}>
            {published ? t("settings.published") : t("settings.unpublished")}
          </span>
          <span className="chip">{tournament.state}</span>
          <span className="muted">
            {tournament.teamCount} / {tournament.maxTeams} {t("tournaments.teams").toLowerCase()}
          </span>
          {started && <span className="chip ts-live">{t("settings.started")}</span>}
        </div>

        <p className="muted ts-hint">
          {published ? t("settings.publishedHint") : t("settings.unpublishedHint")}
        </p>

        <div className="ts-row">
          {!published && (
            <button className="btn btn-primary" disabled={busy} onClick={() => post({ action: "publish" }).then(() => setPublished(true))}>
              {t("settings.publish")}
            </button>
          )}
          {published && !started && (
            <button className="btn btn-secondary" disabled={busy} onClick={() => post({ action: "unpublish" }).then(() => setPublished(false))}>
              {t("settings.unpublish")}
            </button>
          )}

          <a className="btn btn-secondary" href={`/tournaments/${tournament.slug}`}>
            {t("settings.preview")}
          </a>

          {!started && (
            <button
              className="btn btn-primary ts-start"
              disabled={busy || tournament.teamCount < 2}
              title={tournament.teamCount < 2 ? t("settings.needTwo") : t("settings.startHint")}
              onClick={() => post({ action: "start" })}
            >
              {t("settings.start")}
            </button>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------- basics */}
      <section className="ts-block">
        <h3>{t("settings.basics")}</h3>

        <label className="ts-field">
          <span>{t("setup.tournamentName")}</span>
          <input value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={128} />
        </label>

        <label className="ts-field">
          <span>{t("settings.description")}</span>
          <textarea rows={2} value={form.description} onChange={(e) => set({ description: e.target.value })} />
        </label>

        <div className="ts-row">
          <label className="ts-field ts-narrow">
            <span>{t("settings.maxTeams")}</span>
            <input type="number" min={2} max={128} value={form.maxTeams} onChange={(e) => set({ maxTeams: e.target.value })} />
          </label>

          <label className="ts-field ts-narrow">
            <span>{t("settings.teamSize")}</span>
            <select value={form.teamSize} onChange={(e) => set({ teamSize: e.target.value })}>
              {TEAM_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}v{n}
                  {n <= 2 ? ` — ${t("settings.playtest")}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="ts-field">
            <span>{t("settings.startsAt")}</span>
            <input type="datetime-local" value={form.startsAt} onChange={(e) => set({ startsAt: e.target.value })} />
          </label>
        </div>

        <p className="muted ts-hint">{t("settings.startsAtHint")}</p>
      </section>

      {/* ------------------------------------------------------- visibility */}
      <section className="ts-block">
        <h3>{t("settings.visibility")}</h3>

        <div className="ts-row">
          {(["public", "invite"] as const).map((v) => (
            <button
              key={v}
              className={`ts-choice ${form.visibility === v ? "on" : ""}`}
              onClick={() => set({ visibility: v })}
            >
              <strong>{v === "public" ? t("settings.public") : t("settings.inviteOnly")}</strong>
              <span className="muted">
                {v === "public" ? t("settings.publicHint") : t("settings.inviteHint")}
              </span>
            </button>
          ))}
        </div>

        {form.visibility === "invite" && (
          <div className="ts-invite">
            {inviteUrl ? (
              <>
                <code className="ts-link">{inviteUrl}</code>
                <button className="btn btn-secondary ts-small" onClick={() => navigator.clipboard?.writeText(inviteUrl)}>
                  {t("commands.copy")}
                </button>
              </>
            ) : (
              <span className="muted">{t("settings.saveForLink")}</span>
            )}

            <button
              className="btn btn-secondary ts-small"
              disabled={busy}
              onClick={() => post({ action: "rotate-invite" }).then((d) => d?.inviteToken && setInviteToken(d.inviteToken))}
              title={t("settings.rotateHint")}
            >
              {t("settings.rotate")}
            </button>
          </div>
        )}
      </section>

      {/* ----------------------------------------------------------- format */}
      <section className="ts-block">
        <h3>
          {t("settings.format")}
          {started && <span className="ts-locked">{t("settings.lockedOnStart")}</span>}
        </h3>

        <div className="ts-row">
          <label className="ts-field">
            <span>{t("settings.bracket")}</span>
            <select value={form.format} disabled={started} onChange={(e) => set({ format: e.target.value })}>
              {FORMATS.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </label>

          <label className="ts-field ts-narrow">
            <span>{t("setup.finalBo").replace("Final ", "")}</span>
            <select value={form.bestOf} disabled={started} onChange={(e) => set({ bestOf: e.target.value })}>
              {[1, 3, 5].map((n) => <option key={n} value={n}>BO{n}</option>)}
            </select>
          </label>

          <label className="ts-field ts-narrow">
            <span>{t("setup.finalBo")}</span>
            <select value={form.finalBestOf} disabled={started} onChange={(e) => set({ finalBestOf: e.target.value })}>
              <option value="">{t("settings.same")}</option>
              {[1, 3, 5].map((n) => <option key={n} value={n}>BO{n}</option>)}
            </select>
          </label>
        </div>

        <div className="ts-seeds">
          {SEEDINGS.map((s) => (
            <button
              key={s.id}
              className={`ts-choice ${form.seeding === s.id ? "on" : ""}`}
              disabled={started}
              onClick={() => set({ seeding: s.id })}
            >
              <strong>{s.label}</strong>
              <span className="muted">{s.hint}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------- pool */}
      <section className="ts-block">
        <h3>
          {t("tournaments.tabs.pool")}
          <span className="ts-count">{maps.length}</span>
        </h3>

        <p className="muted ts-hint">{t("settings.poolHint")}</p>

        <div className="ts-maps">
          {library.map((m) => (
            <button
              key={m.name}
              className={`ts-map ${maps.includes(m.name) ? "on" : ""}`}
              onClick={() => toggleMap(m.name)}
            >
              {m.label}
            </button>
          ))}
          {library.length === 0 && <p className="muted">{t("maker.noMaps")}</p>}
        </div>
      </section>

      {/* ------------------------------------------------------------ rules */}
      <section className="ts-block">
        <h3>{t("settings.rulesAndPrizes")}</h3>

        <label className="ts-field">
          <span>{t("settings.rules")}</span>
          <textarea rows={6} value={form.rulesText} onChange={(e) => set({ rulesText: e.target.value })} />
        </label>

        <div className="ts-row">
          <label className="ts-field">
            <span>{t("settings.prizes")}</span>
            <textarea rows={3} value={form.prizeText} onChange={(e) => set({ prizeText: e.target.value })} />
          </label>

          <label className="ts-field">
            <span>{t("settings.sponsors")}</span>
            <textarea rows={3} value={form.sponsorsText} onChange={(e) => set({ sponsorsText: e.target.value })} />
          </label>
        </div>
      </section>

      {/* ------------------------------------------------------------ links */}
      <section className="ts-block">
        <h3>{t("settings.links")}</h3>

        <div className="ts-row">
          <label className="ts-field">
            <span>Discord</span>
            <input value={form.discordUrl} onChange={(e) => set({ discordUrl: e.target.value })} placeholder="https://discord.gg/…" />
          </label>

          <label className="ts-field">
            <span>TeamSpeak</span>
            <input value={form.teamSpeakUrl} onChange={(e) => set({ teamSpeakUrl: e.target.value })} placeholder="ts3server://…" />
          </label>
        </div>

        <label className="ts-field">
          <span>{t("settings.twitch")}</span>
          <input value={form.twitchChannels} onChange={(e) => set({ twitchChannels: e.target.value })} placeholder="channel1, channel2" />
        </label>

        <p className="muted ts-hint">{t("settings.twitchHint")}</p>
      </section>

      <div className="ts-save">
        <button className="btn btn-primary" disabled={busy} onClick={save}>
          {t("settings.save")}
        </button>
      </div>
    </div>
  );
}
