"use client";

import { useCallback, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import type { BackupRow } from "@/lib/tournament/backups";
import MatchBubble from "./MatchBubble";
import type { MatchPreview } from "@/lib/tournament/preview";
import "./matchadmin.css";
import StatusTag from "./StatusTag";

// The per-match panel.
//
// Every button here sends a command the plugin already accepts, rather than a
// bespoke API that then has to be kept in step with it. That is why the panel
// can be complete without the plugin knowing it exists — and why a command added
// in game is available here the same day.

type Props = {
  matchId: number;
  matchKey: string;
  teamA: string;
  teamB: string;
  state: string;
  adminKey?: string;
  /** The series, for the hover bubble on the header. */
  preview?: MatchPreview | null;
};

export default function MatchAdmin({ matchId, matchKey, teamA, teamB, state, adminKey, preview }: Props) {
  const { t } = useI18n();
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [restoreRound, setRestoreRound] = useState("");

  // The restart flow. `backups === null` means "not asked yet", which is not
  // the same as "asked and there are none" — the panel says different things
  // for the two and would otherwise flash "no backups" while it loads.
  const [restarting, setRestarting] = useState(false);
  const [backups, setBackups] = useState<BackupRow[] | null>(null);

  const send = useCallback(
    async (body: Record<string, unknown>, label: string) => {
      setBusy(true);
      try {
        const res = await fetch("/api/admin/tournaments", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...body, key: adminKey }),
        });

        const data = await res.json();
        const line = data.reply ?? data.error ?? (data.ok ? "ok" : JSON.stringify(data));

        // Newest first: the answer you are waiting for is the one you just
        // caused, and scrolling to find it is exactly wrong under pressure.
        setLog((l) => [`${label} → ${String(line).trim()}`, ...l].slice(0, 40));
      } catch (err) {
        setLog((l) => [`${label} → ${String(err)}`, ...l].slice(0, 40));
      } finally {
        setBusy(false);
      }
    },
    [adminKey],
  );

  const rcon = (command: string, label = command) =>
    send({ action: "admin", matchId, command }, label);

  /**
   * Opens the restart panel, having first asked the server what it can restore.
   *
   * The ask comes before the choice on purpose. "Restart" with round backups on
   * disk and "restart" without them are different decisions — one throws away a
   * match that could be resumed — and an admin cannot make the right one from a
   * button that does not say which situation they are in.
   */
  const openRestart = useCallback(async () => {
    setRestarting(true);
    setBackups(null);
    setBusy(true);

    try {
      const res = await fetch("/api/admin/tournaments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "backups", matchId, key: adminKey }),
      });

      const data = await res.json();
      setBackups(Array.isArray(data.backups) ? data.backups : []);
    } catch {
      setBackups([]);
    } finally {
      setBusy(false);
    }
  }, [adminKey, matchId]);

  return (
    <div className="ma">
      {/* The bubble hangs off the header rather than the whole card: the card
          is full of buttons, and something that follows the cursor across them
          is a distraction exactly when the panel is being used under pressure. */}
      <MatchBubble preview={preview ?? null} teamA={teamA} teamB={teamB}>
        <header className="ma-head">
          <strong>{teamA}</strong>
          <span className="muted">v</span>
          <strong>{teamB}</strong>
          <code className="ma-key">{matchKey}</code>
          <StatusTag kind="match" value={state} />
        </header>
      </MatchBubble>

      <div className="ma-group">
        <h4>{t("matchAdmin.match")}</h4>
        <button className="btn btn-primary" disabled={busy} onClick={() => send({ action: "start", matchId }, "start")}>
          {t("matchAdmin.start")}
        </button>
        <button className="btn" disabled={busy} onClick={() => rcon("css_forceready")}>
          {t("matchAdmin.forceReady")}
        </button>
        <button className="btn" disabled={busy} onClick={() => rcon("css_restartmatch")}>
          {t("matchAdmin.restart")}
        </button>
        <button className="btn" disabled={busy} onClick={() => rcon("css_t_status", "status")}>
          {t("matchAdmin.status")}
        </button>
      </div>

      <div className="ma-group">
        <h4>{t("matchAdmin.pause")}</h4>
        <button className="btn" disabled={busy} onClick={() => rcon("css_tech")}>
          {t("matchAdmin.techToggle")}
        </button>
        <button className="btn" disabled={busy} onClick={() => rcon("css_unpause")}>
          {t("matchAdmin.resume")}
        </button>
      </div>

      <div className="ma-group">
        <h4>{t("matchAdmin.sides")}</h4>
        <button className="btn" disabled={busy} onClick={() => rcon("css_swap")}>
          {t("matchAdmin.swap")}
        </button>
        {/* Named, not lettered. "A → CT" means nothing to anybody who has not
            read the bracket's internals, and an admin forcing a side under
            pressure should not have to work out which team is A. */}
        <button className="btn" disabled={busy} onClick={() => rcon("css_forceside a t")}>
          {teamA} → T
        </button>
        <button className="btn" disabled={busy} onClick={() => rcon("css_forceside a ct")}>
          {teamA} → CT
        </button>
        <button className="btn" disabled={busy} onClick={() => rcon("css_forceside b t")}>
          {teamB} → T
        </button>
      </div>

      <div className="ma-group">
        <h4>{t("matchAdmin.score")}</h4>
        <input
          value={scoreA}
          onChange={(e) => setScoreA(e.target.value)}
          placeholder={teamA}
          aria-label={teamA}
          inputMode="numeric"
        />
        <input
          value={scoreB}
          onChange={(e) => setScoreB(e.target.value)}
          placeholder={teamB}
          aria-label={teamB}
          inputMode="numeric"
        />
        <button
          className="btn"
          disabled={busy || !scoreA || !scoreB}
          onClick={() => rcon(`css_score ${Number(scoreA)} ${Number(scoreB)}`)}
        >
          {t("matchAdmin.setScore")}
        </button>
      </div>

      <div className="ma-group">
        <h4>{t("matchAdmin.rounds")}</h4>
        <button className="btn" disabled={busy} onClick={() => rcon("css_backups", "backups")}>
          {t("matchAdmin.listBackups")}
        </button>
        <input
          value={restoreRound}
          onChange={(e) => setRestoreRound(e.target.value)}
          placeholder={t("matchAdmin.roundNumber")}
          inputMode="numeric"
        />
        <button
          className="btn"
          disabled={busy || !restoreRound}
          onClick={() => rcon(`css_restore ${Number(restoreRound)}`)}
        >
          {t("matchAdmin.restore")}
        </button>
      </div>

      <div className="ma-group">
        <h4>{t("matchAdmin.restartTitle")}</h4>
        <button className="btn" disabled={busy} onClick={openRestart}>
          {t("matchAdmin.restartMatch")}
        </button>
        <span className="ma-note">{t("matchAdmin.restartKeeps")}</span>
      </div>

      {restarting && (
        <div className="ma-restart">
          <header className="ma-restart-head">
            <h4>{t("matchAdmin.restartTitle")}</h4>
            <button className="btn btn-ghost" onClick={() => setRestarting(false)}>
              {t("matchAdmin.cancel")}
            </button>
          </header>

          {backups === null ? (
            <p className="ma-note">{t("matchAdmin.checkingBackups")}</p>
          ) : backups.length === 0 ? (
            <p className="ma-note">{t("matchAdmin.noBackups")}</p>
          ) : (
            <>
              <p className="ma-note">{t("matchAdmin.backupsFound", { n: String(backups.length) })}</p>

              {/* Every fact the file holds, because the round number alone does
                  not distinguish two backups at the same score, and one either
                  side of halftime has the teams the other way round. */}
              <ul className="ma-backups">
                {backups.map((b) => (
                  <li key={b.round}>
                    <span className="ma-bk-round num">{b.round}</span>

                    <span className="ma-bk-sides">
                      <span className="ma-bk-t">
                        T {b.t.team || "—"} <b className="num">{b.t.score}</b>
                      </span>
                      <span className="ma-bk-ct">
                        CT {b.ct.team || "—"} <b className="num">{b.ct.score}</b>
                      </span>
                    </span>

                    <span className="ma-bk-cash num">
                      ${b.t.cash} / ${b.ct.cash}
                    </span>

                    <button
                      className="btn small"
                      disabled={busy}
                      onClick={() => rcon(`css_restore ${b.round}`, `restore ${b.round}`)}
                    >
                      {t("matchAdmin.restore")}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <button
            className="btn ma-restart-clean"
            disabled={busy}
            onClick={async () => {
              await send({ action: "restart", matchId }, "restart");
              setRestarting(false);
            }}
          >
            {t("matchAdmin.restartClean")}
          </button>
        </div>
      )}

      <div className="ma-group ma-danger">
        <h4>{t("matchAdmin.ending")}</h4>
        {/* Not css_endmatch. That needs the plugin to be holding a live match,
            and the case this is most needed in — a game server that restarted
            and lost it — is exactly the one where it silently does nothing. The
            website ends the match and tells the server afterwards. */}
        <button className="btn" disabled={busy} onClick={() => send({ action: "end", matchId, winner: "a" }, "end a")}>
          {t("matchAdmin.awardTo", { team: teamA })}
        </button>
        <button className="btn" disabled={busy} onClick={() => send({ action: "end", matchId, winner: "b" }, "end b")}>
          {t("matchAdmin.awardTo", { team: teamB })}
        </button>
        <span className="ma-note">{t("matchAdmin.awardNote")}</span>
      </div>

      {log.length > 0 && (
        <pre className="ma-log">{log.join("\n")}</pre>
      )}
    </div>
  );
}
