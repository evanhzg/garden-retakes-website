"use client";

import { useCallback, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import "./matchadmin.css";

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
};

export default function MatchAdmin({ matchId, matchKey, teamA, teamB, state, adminKey }: Props) {
  const { t } = useI18n();
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [restoreRound, setRestoreRound] = useState("");

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

  return (
    <div className="ma">
      <header className="ma-head">
        <strong>{teamA}</strong>
        <span className="muted">v</span>
        <strong>{teamB}</strong>
        <code className="ma-key">{matchKey}</code>
        <span className="chip">{state}</span>
      </header>

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
        <button className="btn" disabled={busy} onClick={() => rcon("css_forceside a t")}>
          A → T
        </button>
        <button className="btn" disabled={busy} onClick={() => rcon("css_forceside a ct")}>
          A → CT
        </button>
      </div>

      <div className="ma-group">
        <h4>{t("matchAdmin.score")}</h4>
        <input value={scoreA} onChange={(e) => setScoreA(e.target.value)} placeholder="A" inputMode="numeric" />
        <input value={scoreB} onChange={(e) => setScoreB(e.target.value)} placeholder="B" inputMode="numeric" />
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

      <div className="ma-group ma-danger">
        <h4>{t("matchAdmin.ending")}</h4>
        <button className="btn" disabled={busy} onClick={() => rcon("css_endmatch a")}>
          {t("matchAdmin.awardA")}
        </button>
        <button className="btn" disabled={busy} onClick={() => rcon("css_endmatch b")}>
          {t("matchAdmin.awardB")}
        </button>
      </div>

      {log.length > 0 && (
        <pre className="ma-log">{log.join("\n")}</pre>
      )}
    </div>
  );
}
