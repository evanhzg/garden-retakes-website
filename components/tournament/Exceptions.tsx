"use client";

import { useCallback, useState } from "react";
import { LifeBuoy } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import type { RosterTeam } from "./Roster";
import "./exceptions.css";

// The things that go wrong on the day.
//
// Every control here breaks a rule the ordinary flows are right to enforce: you
// cannot join a tournament that has started, a roster has a cap, a bracket's
// teams are decided when it is generated. All of that is correct until six
// people are stood waiting and one of them cannot sign in, or brings a
// substitute, or was seeded into the wrong half.
//
// Kept together, and kept visibly apart from the rest of the panel, because
// these are not day-to-day controls: an organizer should have to come here on
// purpose. The override tickbox is per-action rather than a mode, so nobody
// leaves it switched on.
//
// What each one may and may not do is decided by lib/tournament/exceptions.ts,
// not here — this only renders the answer. In particular the refusals come back
// from the server with the reason attached, so a blocked action explains itself
// rather than just failing.

type Result = { kind: "ok" | "error"; lines: string[] } | null;

export default function Exceptions({
  teams,
  matches,
  adminKey,
}: {
  teams: RosterTeam[];
  /** Every match, so a team can be put into the right slot of one. */
  matches: { id: number; label: string; state: string }[];
  adminKey?: string;
}) {
  const { t } = useI18n();

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);

  // Add / move a player.
  const [steamId, setSteamId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [teamId, setTeamId] = useState<string>(String(teams[0]?.id ?? ""));
  const [moveTo, setMoveTo] = useState<string>(String(teams[1]?.id ?? teams[0]?.id ?? ""));
  const [override, setOverride] = useState(false);

  // Put a team into a match.
  const [matchId, setMatchId] = useState<string>(String(matches[0]?.id ?? ""));
  const [slot, setSlot] = useState<"a" | "b">("a");
  const [slotTeam, setSlotTeam] = useState<string>(String(teams[0]?.id ?? ""));

  const send = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setResult(null);

      try {
        const res = await fetch("/api/admin/tournaments", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...body, key: adminKey }),
        });

        const data = await res.json();

        if (!res.ok || data.error) {
          // Blockers come back as a list so each reason gets its own line —
          // "already on another team AND that is not a SteamID" as one run-on
          // sentence is how somebody fixes half a problem and tries again.
          setResult({
            kind: "error",
            lines: Array.isArray(data.blockers) && data.blockers.length
              ? data.blockers
              : [String(data.error ?? "That did not work.")],
          });
          return;
        }

        setResult({
          kind: "ok",
          lines: Array.isArray(data.warnings) && data.warnings.length
            ? [t("exceptions.doneWith"), ...data.warnings]
            : [t("exceptions.done")],
        });

        // The page reads its rosters on the server, so the change is only
        // visible after a reload. Deliberately not automatic: the result of the
        // last action, warnings included, would vanish before it was read.
      } catch (err) {
        setResult({ kind: "error", lines: [String(err)] });
      } finally {
        setBusy(false);
      }
    },
    [adminKey, t],
  );

  const teamOptions = teams.map((team) => (
    <option key={team.id} value={team.id}>
      {team.name}
    </option>
  ));

  return (
    <section className="exc">
      <header className="exc-head">
        <LifeBuoy size={16} aria-hidden />
        <h3>{t("exceptions.title")}</h3>
      </header>

      <p className="exc-lead">{t("exceptions.lead")}</p>

      {/* ---- A player who is not registered, or is on the wrong team ---- */}
      <div className="exc-block">
        <h4>{t("exceptions.playerTitle")}</h4>
        <p className="exc-why">{t("exceptions.playerWhy")}</p>

        <div className="exc-row">
          <label>
            <span>{t("exceptions.steamId")}</span>
            <input
              value={steamId}
              onChange={(e) => setSteamId(e.target.value)}
              placeholder="7656119…"
              inputMode="numeric"
            />
          </label>

          <label>
            <span>{t("exceptions.displayName")}</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("exceptions.optional")}
            />
          </label>

          <label>
            <span>{t("exceptions.team")}</span>
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              {teamOptions}
            </select>
          </label>
        </div>

        <div className="exc-actions">
          <button
            className="btn btn-primary"
            disabled={busy || !steamId || !teamId}
            onClick={() =>
              send({
                action: "add-player",
                teamId: Number(teamId),
                steamId: steamId.trim(),
                displayName: displayName.trim() || undefined,
                override,
              })
            }
          >
            {t("exceptions.addPlayer")}
          </button>

          <button
            className="btn"
            disabled={busy || !steamId || !teamId}
            onClick={() =>
              send({ action: "drop-player", teamId: Number(teamId), steamId: steamId.trim() })
            }
          >
            {t("exceptions.dropPlayer")}
          </button>

          {/* Moving is its own action rather than a drop followed by an add,
              because the two halves can fail independently and a player who is
              on neither team is worse than one on the wrong team. */}
          <label className="exc-move">
            <span>{t("exceptions.moveTo")}</span>
            <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
              {teamOptions}
            </select>
          </label>

          <button
            className="btn"
            disabled={busy || !steamId || !teamId || moveTo === teamId}
            onClick={() =>
              send({
                action: "move-player",
                teamId: Number(teamId),
                toTeamId: Number(moveTo),
                steamId: steamId.trim(),
                override,
              })
            }
          >
            {t("exceptions.movePlayer")}
          </button>
        </div>
      </div>

      {/* ---- The wrong two teams in a match ---- */}
      <div className="exc-block">
        <h4>{t("exceptions.matchTitle")}</h4>
        <p className="exc-why">{t("exceptions.matchWhy")}</p>

        <div className="exc-row">
          <label>
            <span>{t("exceptions.match")}</span>
            <select value={matchId} onChange={(e) => setMatchId(e.target.value)}>
              {matches.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — {m.state}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>{t("exceptions.slot")}</span>
            <select value={slot} onChange={(e) => setSlot(e.target.value as "a" | "b")}>
              <option value="a">A</option>
              <option value="b">B</option>
            </select>
          </label>

          <label>
            <span>{t("exceptions.team")}</span>
            <select value={slotTeam} onChange={(e) => setSlotTeam(e.target.value)}>
              {teamOptions}
            </select>
          </label>
        </div>

        <div className="exc-actions">
          <button
            className="btn btn-primary"
            disabled={busy || !matchId || !slotTeam}
            onClick={() =>
              send({
                action: "set-match-team",
                matchId: Number(matchId),
                slot,
                teamId: Number(slotTeam),
                override,
              })
            }
          >
            {t("exceptions.setTeam")}
          </button>

          {/* Emptying a slot is a real need — a withdrawal before the round is
              played — and is not the same as choosing a team. */}
          <button
            className="btn"
            disabled={busy || !matchId}
            onClick={() =>
              send({ action: "set-match-team", matchId: Number(matchId), slot, teamId: null, override })
            }
          >
            {t("exceptions.clearSlot")}
          </button>
        </div>
      </div>

      {/* The override, once, at the bottom, applying to whichever action is
          pressed next. A tickbox per button would be four tickboxes and the
          same decision four times. */}
      <label className="exc-override">
        <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
        <span>{t("exceptions.override")}</span>
      </label>

      {result && (
        <ul className={`exc-result ${result.kind}`}>
          {result.lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
