"use client";

import { useCallback, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import "./roster.css";
import StatusTag from "./StatusTag";

// The organizer's view of who is playing.
//
// Its reason for existing is the two things an organizer has to fix during
// registration and cannot ask a captain to fix for them: a team name that
// cannot go on a bracket, and a player name that is a wall of clan tags. Both
// are edited in place here.

export type RosterMember = {
  steamId: string;
  profileName: string;
  displayName: string | null;
  captain: boolean;
  status: string;
  roleT: string | null;
  roleCt: string | null;
};

export type RosterTeam = {
  id: number;
  name: string;
  tag: string | null;
  status: string;
  seed: number | null;
  inviteToken: string | null;
  captainSteamId: string;
  members: RosterMember[];
};

export default function Roster({
  teams,
  adminKey,
  origin,
  slug,
}: {
  teams: RosterTeam[];
  adminKey?: string;
  origin: string;
  slug: string;
}) {
  const { t } = useI18n();

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setNotice(null);
      try {
        const res = await fetch("/api/admin/tournaments/roster", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...body, key: adminKey }),
        });
        const data = await res.json();
        setNotice(data.error ?? t("settings.saved"));
        if (data.ok) setTimeout(() => window.location.reload(), 400);
      } catch (err) {
        setNotice(String(err));
      } finally {
        setBusy(false);
      }
    },
    [adminKey, t],
  );

  if (teams.length === 0) {
    return <p className="muted">{t("tournaments.noTeams")}</p>;
  }

  return (
    <div className="rs">
      {notice && <p className="rs-notice">{notice}</p>}

      {teams.map((team) => {
        const nameKey = `team-${team.id}`;
        return (
          <article key={team.id} className={`rs-team st-${team.status}`}>
            <header className="rs-head">
              {team.seed !== null && <span className="rs-seed num">{team.seed}</span>}

              {/* Controlled, not defaultValue. An uncontrolled input keeps
                  whatever was typed into it regardless of what the props say,
                  so after a rename saved elsewhere — or a switch to a different
                  tournament — the box kept showing the stale name while the
                  server held the new one. */}
              <input
                id={`rs-name-${team.id}`}
                aria-label={t("roster.teamName")}
                className="rs-name"
                value={edits[nameKey] ?? team.name}
                maxLength={64}
                onChange={(e) => setEdits((x) => ({ ...x, [nameKey]: e.target.value }))}
              />

              <button
                className="btn rs-small"
                disabled={busy || !edits[nameKey] || edits[nameKey] === team.name}
                onClick={() => post({ action: "rename-team", teamId: team.id, name: edits[nameKey] })}
              >
                {t("auto.inventorysimulator.rename")}
              </button>

              <StatusTag kind="team" value={team.status} />
            </header>

            {/* The captain's link, so an organizer can re-send it when a player
                says they never got one — which is most of them. */}
            {team.inviteToken && (
              <div className="rs-invite">
                <code>{`${origin}/tournaments/${slug}/join?team=${team.inviteToken}`}</code>
                <button
                  className="btn rs-small"
                  onClick={() =>
                    navigator.clipboard?.writeText(
                      `${origin}/tournaments/${slug}/join?team=${team.inviteToken}`,
                    )
                  }
                >
                  {t("commands.copy")}
                </button>
              </div>
            )}

            <ul className="rs-members">
              {team.members.map((m) => {
                const key = `p-${team.id}-${m.steamId}`;
                const current = edits[key] ?? m.displayName ?? "";
                return (
                  <li key={m.steamId}>
                    <a className="rs-profile" href={`/players/${m.steamId}`}>
                      {m.profileName}
                    </a>
                    {m.captain && <span className="rs-cap" title="Captain">★</span>}

                    <input
                      className="rs-display"
                      value={current}
                      placeholder={t("roster.displayPlaceholder")}
                      maxLength={32}
                      onChange={(e) => setEdits((x) => ({ ...x, [key]: e.target.value }))}
                    />

                    <button
                      className="btn rs-small"
                      disabled={busy || current === (m.displayName ?? "")}
                      onClick={() =>
                        post({
                          action: "display-name",
                          teamId: team.id,
                          steamId: m.steamId,
                          displayName: current,
                        })
                      }
                    >
                      {t("roster.setName")}
                    </button>

                    {(m.roleT || m.roleCt) && (
                      <span className="rs-roles">
                        {m.roleT ?? "—"} / {m.roleCt ?? "—"}
                      </span>
                    )}

                    <StatusTag kind="member" value={m.status} label={t("roster.player")} />
                  </li>
                );
              })}

              {team.members.length === 0 && (
                <li className="muted">{t("tournaments.noPlayers")}</li>
              )}
            </ul>
          </article>
        );
      })}
    </div>
  );
}
