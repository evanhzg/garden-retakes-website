"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Ban,
  Check,
  Copy,
  Flag,
  Gauge,
  Layers,
  Map as MapIcon,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Server,
  Shuffle,
  Trophy,
  UserCog,
} from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import type { BackupRow } from "@/lib/tournament/backups";
import { CT_ROLES, T_ROLES } from "@/lib/tournament/roles";
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

type MatchContext = {
  serverId: number | null;
  pendingServerId: number | null;
  score: { a: number; b: number; map: string; ordinal: number } | null;
  pool: string[];
  rosterA: { steamId: string; name: string | null }[];
  rosterB: { steamId: string; name: string | null }[];
  servers: {
    id: number;
    name: string;
    busy: boolean;
    isThisMatch: boolean;
    matchId: number | null;
    matchKey: string | null;
  }[];
};

type Props = {
  matchId: number;
  matchKey: string;
  teamA: string;
  teamB: string;
  state: string;
  adminKey?: string;
  /** The series, for the hover bubble on the header. */
  preview?: MatchPreview | null;
  /**
   * Called when the panel has done the thing it was opened for.
   *
   * Only awarding the match uses it. Every other control here is something an
   * admin does DURING a match and then keeps watching — closing the panel after
   * a side swap or a score correction would take away the console line that
   * says whether it worked. Awarding the win is the end of the match, so
   * leaving the panel open over a finished game is just something else to
   * dismiss.
   */
  onDone?: () => void;
};

export default function MatchAdmin({ matchId, matchKey, teamA, teamB, state, adminKey, preview, onDone }: Props) {
  const { t } = useI18n();
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [restoreRound, setRestoreRound] = useState("");
  const [roleSteamId, setRoleSteamId] = useState("");
  const [roleSide, setRoleSide] = useState("t");
  const [roleName, setRoleName] = useState("");
  const [copied, setCopied] = useState(false);

  /**
   * Everything the panel needs that the page it opens over does not have: the
   * live score, both rosters, the map pool and the fleet.
   *
   * Null while it loads, so a score box is empty rather than briefly showing
   * 0-0 for a match at 9-4 — an admin who types over that has just reset a
   * scoreboard by reading a placeholder.
   */
  const [ctx, setCtx] = useState<MatchContext | null>(null);

  const loadContext = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/tournaments/match-context?matchId=${matchId}${adminKey ? `&key=${encodeURIComponent(adminKey)}` : ""}`,
        { cache: "no-store" },
      );
      if (res.ok) setCtx(await res.json());
    } catch {
      // A panel with no context still has every button; only the pre-filled
      // values and the dropdowns are missing, so failing quietly beats an
      // error banner over a working panel.
    }
  }, [matchId, adminKey]);

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  // The score boxes start at what the scoreboard says. Set once the context
  // lands rather than on every refresh, so a half-typed correction is not
  // overwritten under the cursor.
  useEffect(() => {
    if (ctx?.score) {
      setScoreA(String(ctx.score.a));
      setScoreB(String(ctx.score.b));
    }
  }, [ctx?.score?.a, ctx?.score?.b]);

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
        return data as { ok?: boolean };
      } catch (err) {
        setLog((l) => [`${label} → ${String(err)}`, ...l].slice(0, 40));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [adminKey],
  );

  /**
   * Awards the match, then closes the panel.
   *
   * Closes only on success. A refusal — no such match, already ended, the
   * plugin unreachable — is exactly when the admin needs to still be looking at
   * the console line that says so, and a panel that vanishes on failure reads
   * as "done" for something that did not happen.
   */
  const award = useCallback(
    async (winner: "a" | "b") => {
      const data = await send({ action: "end", matchId, winner }, `end ${winner}`);
      if (data?.ok) onDone?.();
    },
    [send, matchId, onDone],
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
          {/* The id, copyable. "Which match?" is the first question of every
              report, and reading seventeen characters aloud off a screenshot is
              how the wrong one gets looked at. */}
          <button
            className="ma-key"
            title={t("matchAdmin.copyId")}
            onClick={() => {
              navigator.clipboard?.writeText(matchKey);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1200);
            }}
          >
            <code>{matchKey}</code>
            {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
          </button>
          <StatusTag kind="match" value={state} />
        </header>
      </MatchBubble>

      <div className="ma-group">
        <h4><Play size={13} aria-hidden />{t("matchAdmin.match")}</h4>
        <button className="btn btn-primary" disabled={busy} onClick={() => send({ action: "start", matchId }, "start")}>
          <Play size={14} aria-hidden />
          {t("matchAdmin.start")}
        </button>
        <button className="btn" disabled={busy} onClick={() => rcon("css_forceready")}>
          <Check size={14} aria-hidden />
          {t("matchAdmin.forceReady")}
        </button>
        <button className="btn" disabled={busy} onClick={() => rcon("css_restartmatch")}>
          <RotateCcw size={14} aria-hidden />
          {t("matchAdmin.restart")}
        </button>
        <button className="btn" disabled={busy} onClick={() => rcon("css_t_status", "status")}>
          <RefreshCw size={14} aria-hidden />
          {t("matchAdmin.status")}
        </button>

        {/* One control, because css_tech IS the toggle. A separate Resume was
            a second button for the same command's other half, and the pair
            invited "which one am I in" at exactly the wrong moment. */}
        <button className="btn" disabled={busy} onClick={() => rcon("css_tech")}>
          <Pause size={14} aria-hidden />
          {t("matchAdmin.techToggle")}
        </button>

        {/* Invert, and nothing else. The four force-a-side buttons could put
            both teams on the same half, and named "A → CT" they read as though
            they were setting the whole match up rather than overriding one
            side of it. Swapping is the operation anybody actually wants. */}
        <button className="btn" disabled={busy} onClick={() => rcon("css_swap")}>
          <Shuffle size={14} aria-hidden />
          {t("matchAdmin.swap")}
        </button>
      </div>

      <hr className="ma-divide" />

      <div className="ma-group">
        <h4><Flag size={13} aria-hidden />{t("matchAdmin.score")}</h4>
        {/* Pre-filled from the live map, so a correction is an edit of what is
            there rather than a number recalled from a stream. */}
        <label className="ma-inline">
          <span>{teamA}</span>
          <input
            value={scoreA}
            onChange={(e) => setScoreA(e.target.value)}
            aria-label={teamA}
            inputMode="numeric"
          />
        </label>
        <label className="ma-inline">
          <span>{teamB}</span>
          <input
            value={scoreB}
            onChange={(e) => setScoreB(e.target.value)}
            aria-label={teamB}
            inputMode="numeric"
          />
        </label>
        <button
          className="btn"
          disabled={busy || !scoreA || !scoreB}
          onClick={async () => {
            await rcon(`css_score ${Number(scoreA)} ${Number(scoreB)}`);
            loadContext();
          }}
        >
          <Check size={14} aria-hidden />
          {t("matchAdmin.setScore")}
        </button>
      </div>

      <hr className="ma-divide" />

      <div className="ma-group">
        <h4><Gauge size={13} aria-hidden />{t("matchAdmin.tier")}</h4>
        {/* Both sides on one row: a tier is only ever read against the other
            team's, and two separate controls made comparing them a memory
            exercise. */}
        <label className="ma-inline">
          <span>{teamA}</span>
          <select
            className="ma-select"
            defaultValue=""
            disabled={busy}
            onChange={(e) => e.target.value && rcon(`css_tier a ${e.target.value}`)}
          >
            <option value="">—</option>
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>{t(`matchAdmin.tierN.${n}`)}</option>
            ))}
          </select>
        </label>
        <label className="ma-inline">
          <span>{teamB}</span>
          <select
            className="ma-select"
            defaultValue=""
            disabled={busy}
            onChange={(e) => e.target.value && rcon(`css_tier b ${e.target.value}`)}
          >
            <option value="">—</option>
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>{t(`matchAdmin.tierN.${n}`)}</option>
            ))}
          </select>
        </label>
      </div>

      <hr className="ma-divide" />

      <div className="ma-group">
        <h4><UserCog size={13} aria-hidden />{t("matchAdmin.roles")}</h4>
        {/* A picker rather than a SteamID box. The id is what goes on the wire,
            but nobody has it to hand mid-match, and a control that needs a
            copy-paste from another panel is a control that goes unused. */}
        <select
          className="ma-select ma-wide"
          value={roleSteamId}
          disabled={busy}
          onChange={(e) => setRoleSteamId(e.target.value)}
        >
          <option value="">{t("matchAdmin.pickPlayer")}</option>
          {ctx && (
            <>
              <optgroup label={teamA}>
                {ctx.rosterA.map((p) => (
                  <option key={p.steamId} value={p.steamId}>
                    {p.name || `Player ${p.steamId.slice(-4)}`}
                  </option>
                ))}
              </optgroup>
              <optgroup label={teamB}>
                {ctx.rosterB.map((p) => (
                  <option key={p.steamId} value={p.steamId}>
                    {p.name || `Player ${p.steamId.slice(-4)}`}
                  </option>
                ))}
              </optgroup>
            </>
          )}
        </select>
        <select className="ma-select" value={roleSide} disabled={busy} onChange={(e) => setRoleSide(e.target.value)}>
          <option value="t">T</option>
          <option value="ct">CT</option>
        </select>
        <select className="ma-select" value={roleName} disabled={busy} onChange={(e) => setRoleName(e.target.value)}>
          <option value="">{t("matchAdmin.pickRole")}</option>
          {(roleSide === "t" ? T_ROLES : CT_ROLES).map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <button
          className="btn"
          disabled={busy || !roleSteamId || !roleName}
          onClick={async () => {
            await rcon(`css_setrole ${roleSteamId.trim()} ${roleSide} ${roleName}`);
            loadContext();
          }}
        >
          <Check size={14} aria-hidden />
          {t("matchAdmin.setRole")}
        </button>
      </div>

      <hr className="ma-divide" />

      <div className="ma-group">
        <h4><MapIcon size={13} aria-hidden />{t("matchAdmin.map")}</h4>
        {/* Changing the map being played resets its score, and the note says so
            before the click rather than after. The rounds already played were
            played somewhere else; carrying them over would be a scoreboard
            describing a game nobody had. */}
        <select
          className="ma-select ma-wide"
          defaultValue=""
          disabled={busy || !ctx}
          onChange={async (e) => {
            const map = e.target.value;
            if (!map) return;
            e.target.value = "";
            await send({ action: "set-map", matchId, map }, `map ${map}`);
            loadContext();
          }}
        >
          <option value="">{t("matchAdmin.pickMap")}</option>
          {(ctx?.pool ?? []).map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <span className="ma-note">
          {ctx?.score
            ? t("matchAdmin.mapResets", { map: ctx.score.map })
            : t("matchAdmin.mapNoLive")}
        </span>
      </div>

      <hr className="ma-divide" />

      <div className="ma-group">
        <h4><Server size={13} aria-hidden />{t("matchAdmin.server")}</h4>
        {/* Busy boxes are shown and disabled rather than hidden. "Why is the
            fleet half its size" is answered by seeing T3 greyed with the match
            that holds it, and a dropdown that silently omits four servers
            cannot answer it at all. */}
        <select
          className="ma-select ma-wide"
          value={String(ctx?.serverId ?? "")}
          disabled={busy || !ctx}
          onChange={async (e) => {
            const serverId = Number(e.target.value);
            if (!serverId || serverId === ctx?.serverId) return;
            await send({ action: "move-server", matchId, serverId }, `server ${serverId}`);
            loadContext();
          }}
        >
          <option value="">{t("matchAdmin.noServer")}</option>
          {(ctx?.servers ?? []).map((sv) => (
            <option key={sv.id} value={sv.id} disabled={sv.busy}>
              {sv.busy ? t("matchAdmin.serverBusy", { name: sv.name, match: sv.matchKey ?? String(sv.matchId) }) : sv.name}
            </option>
          ))}
        </select>
        <span className="ma-note">
          {ctx?.pendingServerId
            ? t("matchAdmin.serverPending")
            : state === "live"
              ? t("matchAdmin.serverAtRoundEnd")
              : t("matchAdmin.serverNow")}
        </span>
      </div>

      <hr className="ma-divide" />

      <div className="ma-group">
        <h4><Layers size={13} aria-hidden />{t("matchAdmin.rounds")}</h4>
        <button className="btn" disabled={busy} onClick={() => rcon("css_backups", "backups")}>
          <Layers size={14} aria-hidden />
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
        <h4><RotateCcw size={13} aria-hidden />{t("matchAdmin.restartTitle")}</h4>
        <button className="btn" disabled={busy} onClick={openRestart}>
          <Ban size={14} aria-hidden />
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
        <h4><Trophy size={13} aria-hidden />{t("matchAdmin.ending")}</h4>
        {/* Not css_endmatch. That needs the plugin to be holding a live match,
            and the case this is most needed in — a game server that restarted
            and lost it — is exactly the one where it silently does nothing. The
            website ends the match and tells the server afterwards. */}
        <button className="btn" disabled={busy} onClick={() => award("a")}>
          <Trophy size={14} aria-hidden />
          {t("matchAdmin.awardTo", { team: teamA })}
        </button>
        <button className="btn" disabled={busy} onClick={() => award("b")}>
          <Trophy size={14} aria-hidden />
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
