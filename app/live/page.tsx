"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from '@/components/I18nProvider';
import AvatarImage from "@/components/AvatarImage";

// The live-match view was written in Tailwind classes; the project has no
// Tailwind, so none of them did anything and the page fell back to bare HTML
// wrapped in a few real `.panel`s. It now uses the same tokens as LiveIdle
// below, which was already converted.

// The horizontal gutter now comes from .container (--page-pad); PAD is the
// vertical rhythm only, so a page can no longer drift from the site gutter.
const PAD = "0px";

/** Team A takes the accent, team B its counterpart. */
const TEAM_COLOR = { a: "var(--color-accent)", b: "var(--color-accent-2)" } as const;

interface LivePlayer {
  SteamId: string;
  Name: string;
  Team: string;
  Kills: number;
  Deaths: number;
  Assists: number;
  Damage: number;
  Elo: number;
}

interface HeadToHead {
  KillerName: string;
  VictimName: string;
  Kills: number;
}

interface LiveMatchData {
  Map: string;
  Mode: string;
  IsCr: boolean;
  IsRanked: boolean;
  TeamAName: string;
  TeamBName: string;
  ScoreA: number;
  ScoreB: number;
  WinPredictionA: string;
  WinPredictionB: string;
  Players: LivePlayer[];
  HeadToHead?: HeadToHead[];
}

const COMMON_MAPS = [
  "de_mirage", "de_inferno", "de_dust2", "de_vertigo", 
  "de_nuke", "de_ancient", "de_anubis", "de_train"
];

export default function LiveMatchPage() {
    const { t } = useI18n();

  const [match, setMatch] = useState<LiveMatchData | null>(null);
  const [isLive, setIsLive] = useState<boolean>(true);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [customMap, setCustomMap] = useState("");

  useEffect(() => {
    const fetchLiveMatch = async () => {
      try {
        const res = await fetch("/api/live");
        if (res.ok) {
          const json = await res.json();
          if (json.isAdmin) setIsAdmin(true);
          
          if (json.live && json.data) {
            setMatch(json.data);
            setIsLive(true);
          } else {
            setIsLive(false);
          }
        } else {
          setIsLive(false);
        }
      } catch (err) {
        console.error(err);
        setIsLive(false);
      } finally {
        setLoading(false);
      }
    };

    fetchLiveMatch();
    const interval = setInterval(fetchLiveMatch, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleAdminAction = async (command: string) => {
    if (!confirm(`Execute command: ${command}?`)) return;
    try {
      const res = await fetch("/api/admin/rcon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      const data = await res.json();
      if (res.ok) {
        alert("Command executed successfully!");
      } else {
        alert("Error: " + data.error);
      }
    } catch (err) {
      alert("Failed to execute command.");
    }
  };

  // Idle is the state this page is in most of the time, so it gets the same
  // care as a live match rather than a one-line apology: what the page will
  // show when a round starts, how to get on the server, and where to go now.
  if (loading || !isLive || !match) {
    return <LiveIdle loading={loading} />;
  }

  const teamA = match.Players.filter(p => p.Team === "A");
  const teamB = match.Players.filter(p => p.Team === "B");

  return (
    <main style={{ padding: `clamp(32px, 6vw, 64px) ${PAD}` }}>
      <div style={{ maxWidth: 1280, marginInline: "auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: 20,
            flexWrap: "wrap",
            borderBottom: "2px solid var(--color-divider)",
            paddingBottom: 20,
            marginBottom: 28,
          }}
        >
          <div>
            <span className="kicker" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="live-dot" />
              {t("auto.page.live")}
                                      </span>
            <h1 style={{ fontSize: "clamp(30px, 4.2vw, 52px)", letterSpacing: "-0.02em", margin: "10px 0 0" }}>
              {match.Map}
            </h1>
            <div
              style={{
                fontSize: 13,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "color-mix(in srgb, var(--color-text) 62%, transparent)",
                marginTop: 6,
              }}
            >
              {match.Mode}
              {match.IsRanked ? " · Ranked" : ""}
            </div>
          </div>

          {isAdmin && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                flexWrap: "wrap",
                border: "1px solid var(--color-divider)",
                padding: "var(--space-2) var(--space-3)",
                background: "var(--color-surface)",
              }}
            >
              <span className="kicker" style={{ fontSize: 11 }}>
                {t("auto.page.mod")}
                                            </span>
              <label className="sr-only" htmlFor="live-map-select">
                {t("auto.page.change_map")}
                                            </label>
              <select
                id="live-map-select"
                className="input"
                style={{ width: "auto" }}
                onChange={(e) => {
                  if (e.target.value) {
                    handleAdminAction(`css_gmap ${e.target.value}`);
                    e.target.value = "";
                  }
                }}
                defaultValue=""
              >
                <option value="" disabled>
                  {t("auto.page.change_map")}
                                                  </option>
                {COMMON_MAPS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor="live-map-custom">
                {t("auto.page.custom_map_name")}
                                            </label>
              <input
                id="live-map-custom"
                className="input"
                style={{ width: 150 }}
                type="text"
                placeholder={t("auto.page.custom_map")}
                value={customMap}
                onChange={(e) => setCustomMap(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  if (customMap) handleAdminAction(`css_gmap ${customMap}`);
                }}
              >
                {t("auto.page.go")}
                                            </button>
            </div>
          )}
        </div>

        {match.IsCr && (
          <Scoreboard
            teamA={match.TeamAName}
            teamB={match.TeamBName}
            scoreA={match.ScoreA}
            scoreB={match.ScoreB}
            predictionA={match.WinPredictionA}
            predictionB={match.WinPredictionB}
          />
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: match.IsCr ? "repeat(auto-fit, minmax(340px, 1fr))" : "minmax(0, 1fr)",
            gap: "var(--space-6)",
          }}
        >
          {match.IsCr ? (
            <>
              <PlayerTable teamName={match.TeamAName} players={teamA} isRanked={match.IsRanked} side="a" isAdmin={isAdmin} onAdminAction={handleAdminAction} />
              <PlayerTable teamName={match.TeamBName} players={teamB} isRanked={match.IsRanked} side="b" isAdmin={isAdmin} onAdminAction={handleAdminAction} />
            </>
          ) : (
            <PlayerTable teamName="Scoreboard" players={match.Players} isRanked={match.IsRanked} side="a" isAdmin={isAdmin} onAdminAction={handleAdminAction} />
          )}
        </div>

        {match.HeadToHead && match.HeadToHead.length > 0 && (
          <section style={{ marginTop: "clamp(40px, 6vw, 64px)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
              <h2 style={{ fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", margin: 0 }}>
                {t("auto.page.head_to_head")}
                                            </h2>
              <span className="rule-draw" style={{ flex: 1, height: 2, background: "var(--color-divider)" }} />
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 2,
                background: "var(--color-divider)",
                border: "1px solid var(--color-divider)",
              }}
            >
              {match.HeadToHead.map((h2h) => (
                <div
                  key={`${h2h.KillerName}-${h2h.VictimName}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    background: "var(--color-bg)",
                    padding: "16px 18px",
                  }}
                >
                  <span style={{ fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {h2h.KillerName}
                  </span>
                  <span className="num" style={{ fontWeight: 700, color: "var(--color-accent)", flex: "none" }}>
                    {h2h.Kills}{t("auto.page._ndash_0")}
                                            </span>
                  <span
                    style={{
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      textAlign: "right",
                      color: "color-mix(in srgb, var(--color-text) 55%, transparent)",
                    }}
                  >
                    {h2h.VictimName}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

/** Competitive-round header: both team names, the score and the Elo swing. */
function Scoreboard({
  teamA,
  teamB,
  scoreA,
  scoreB,
  predictionA,
  predictionB,
}: {
  teamA: string;
  teamB: string;
  scoreA: number;
  scoreB: number;
  predictionA: string;
  predictionB: string;
}) {
    const { t } = useI18n();

  const side = (name: string, prediction: string, color: string, align: "right" | "left") => {
    const [win, loss] = prediction.split("/");
    return (
      <div style={{ flex: 1, textAlign: align, minWidth: 220 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "clamp(22px, 2.6vw, 34px)", color }}>
          {name}
        </div>
        <div
          style={{
            fontSize: 12,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "color-mix(in srgb, var(--color-text) 60%, transparent)",
            marginTop: 6,
          }}
        >
          {t("auto.page.win")} <span className="num" style={{ color: "var(--color-text)" }}>{win}</span> {t("auto.page._loss")}{" "}
          <span className="num" style={{ color: "var(--color-text)" }}>{loss}</span>
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "clamp(16px, 4vw, 48px)",
        flexWrap: "wrap",
        border: "2px solid var(--color-divider)",
        padding: "clamp(24px, 4vw, 40px)",
        marginBottom: "clamp(32px, 5vw, 48px)",
      }}
    >
      {side(teamA, predictionA, TEAM_COLOR.a, "right")}

      <div
        className="num"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "clamp(12px, 2vw, 28px)",
          fontWeight: 700,
          fontSize: "clamp(44px, 7vw, 84px)",
          lineHeight: 1,
          letterSpacing: "-0.04em",
        }}
      >
        <span style={{ color: scoreA > scoreB ? TEAM_COLOR.a : "inherit" }}>{scoreA}</span>
        <span style={{ color: "var(--color-divider)", fontWeight: 400 }}>{t("auto.page._ndash")}</span>
        <span style={{ color: scoreB > scoreA ? TEAM_COLOR.b : "inherit" }}>{scoreB}</span>
      </div>

      {side(teamB, predictionB, TEAM_COLOR.b, "left")}
    </div>
  );
}

function PlayerTable({
  teamName,
  players,
  isRanked,
  side,
  isAdmin,
  onAdminAction,
}: {
  teamName: string;
  players: LivePlayer[];
  isRanked: boolean;
  side: "a" | "b";
  isAdmin: boolean;
  onAdminAction: (cmd: string) => void;
}) {
    const { t } = useI18n();

  const numeric: React.CSSProperties = { textAlign: "right" };
  // `players` is state owned by the page — sorting in place would mutate it and
  // reorder the other team's table as a side effect on the next render.
  const ordered = [...players].sort((a, b) => b.Kills - a.Kills);

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <h2
          style={{
            fontSize: "clamp(20px, 2.4vw, 28px)",
            letterSpacing: "-0.02em",
            margin: 0,
            color: TEAM_COLOR[side],
          }}
        >
          {teamName}
        </h2>
        <span className="rule-draw" style={{ flex: 1, height: 2, background: "var(--color-divider)" }} />
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="table num" style={{ minWidth: 460 }}>
          <thead>
            <tr>
              <th scope="col">{t("auto.page.player")}</th>
              <th scope="col" style={numeric}>K</th>
              <th scope="col" style={numeric}>A</th>
              <th scope="col" style={numeric}>D</th>
              <th scope="col" style={numeric}>{t("auto.page.dmg")}</th>
              <th scope="col" style={numeric}>{t("auto.page.rating")}</th>
              {isAdmin && (
                <th scope="col" style={numeric}>
                  {t("auto.page.mod")}
                                                  </th>
              )}
            </tr>
          </thead>
          <tbody>
            {ordered.map((p) => {
              const rating = (p.Kills + p.Assists * 0.5 + p.Damage * 0.01) / Math.max(1, p.Deaths);
              return (
                <tr key={p.SteamId}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <Link href={`/players/${p.SteamId}`} style={{ flex: "none" }}>
                        {/* Steam avatar, resolved and cached by AvatarImage —
                            this used to point at a local /<steamId>_pp.png. */}
                        <AvatarImage steamId={String(p.SteamId)} alt={p.Name} className="avatar" />
                      </Link>
                      <div style={{ minWidth: 0 }}>
                        <Link
                          href={`/players/${p.SteamId}`}
                          className="link-underline"
                          style={{
                            fontWeight: 700,
                            color: "inherit",
                            textDecoration: "none",
                            display: "block",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: 160,
                          }}
                        >
                          {p.Name}
                        </Link>
                        {isRanked && (
                          <span
                            style={{
                              fontSize: 11,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                              color: "color-mix(in srgb, var(--color-text) 55%, transparent)",
                            }}
                          >
                            {t("auto.page.elo")} <span style={{ color: "var(--color-accent)", fontWeight: 700 }}>{p.Elo}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={{ ...numeric, fontWeight: 700 }}>{p.Kills}</td>
                  <td style={numeric}>{p.Assists}</td>
                  <td style={numeric}>{p.Deaths}</td>
                  <td style={numeric}>{p.Damage}</td>
                  <td style={numeric}>
                    <span style={{ fontWeight: 700, color: rating >= 1 ? "var(--color-accent)" : "inherit" }}>
                      {rating.toFixed(2)}
                    </span>
                  </td>
                  {isAdmin && (
                    <td style={numeric}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-icon"
                        onClick={() => onAdminAction(`css_gkick ${p.SteamId}`)}
                        title={`Kick ${p.Name}`}
                        aria-label={`Kick ${p.Name}`}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <path d="M18 6 6 18" />
                          <path d="m6 6 12 12" />
                        </svg>
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            {ordered.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} className="muted" style={{ textAlign: "center", padding: 24 }}>
                  {t("auto.page.no_players_currently_assigned")}
                                                  </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Idle / connecting state.

   The server is not in a live round most of the time, so this is the view the
   page usually shows. It previously read "No Live Match" over a dead grey
   page. Now it explains what will appear here, offers the connect action, and
   keeps a slow scanline running so the page reads as watching rather than
   broken.
   ───────────────────────────────────────────────────────────────────── */
function LiveIdle({ loading }: { loading: boolean }) {
    const { t } = useI18n();

  const serverAddress = process.env.NEXT_PUBLIC_SERVER_ADDRESS ?? "";
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`connect ${serverAddress}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  const willShow = [
    { k: "Scoreboard", v: "Live score, round number and side" },
    { k: "Players", v: "Both teams with K/D/A and ADR as it happens" },
    { k: "Economy", v: "Buy state and equipment value per side" },
    { k: "Timeline", v: "Plants, defuses and clutches as they land" },
  ];

  return (
    <main style={{ padding: "clamp(48px, 8vw, 96px) 0" }}>
      <div style={{ maxWidth: 1100, marginInline: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: loading ? "var(--color-neutral-200)" : "var(--color-surface)",
              border: "1px solid var(--color-divider)",
              padding: "6px 12px",
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            <span
              className="live-dot"
              style={{ background: loading ? "var(--color-neutral-500)" : "var(--color-neutral-400)" }}
            />
            {loading ? "Connecting" : "Server idle"}
          </span>
          <span className="rule-draw" style={{ flex: 1, height: 2, background: "var(--color-divider)" }} />
        </div>

        <h1 style={{ fontSize: "clamp(38px, 6vw, 72px)", lineHeight: 0.98, margin: "0 0 18px" }}>
          {loading ? "Reading the server…" : "Nothing live right now."}
        </h1>

        <p
          style={{
            fontSize: 17,
            maxWidth: "52ch",
            color: "color-mix(in srgb, var(--color-text) 72%, transparent)",
            margin: "0 0 36px",
          }}
        >
          {loading
            ? "Asking the game server for the current round."
            : "The server is idle or in warmup. This page refreshes on its own — leave it open and the match will appear here the moment a round starts."}
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 56 }}>
          {serverAddress && (
            <>
              <a className="btn btn-primary" href={`steam://connect/${serverAddress}`}>
                {t("auto.page.join_the_server")}
                                            </a>
              <button type="button" className="btn btn-secondary" onClick={copy}>
                {copied ? "Copied" : `Copy connect ${serverAddress}`}
              </button>
            </>
          )}
          <Link className="btn btn-secondary" href="/">
            {t("auto.page.ladder")}
                                </Link>
          <Link className="btn btn-secondary" href="/stats">
            {t("auto.page.season_stats")}
                                </Link>
        </div>

        <div style={{ borderTop: "2px solid var(--color-divider)", paddingTop: 28 }}>
          <h2 style={{ fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 20 }}>
            {t("auto.page.what_appears_here_during_a_mat")}
                                </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 2,
              background: "var(--color-divider)",
              border: "1px solid var(--color-divider)",
            }}
          >
            {willShow.map((f, i) => (
              <div
                key={f.k}
                style={{
                  background: "var(--color-bg)",
                  padding: "20px 18px",
                  animation: "gr-fade-up 0.5s cubic-bezier(.16,1,.3,1) both",
                  animationDelay: `${0.05 + i * 0.07}s`,
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontWeight: 800,
                    fontSize: 15,
                    marginBottom: 6,
                  }}
                >
                  {f.k}
                </div>
                <div style={{ fontSize: 13, color: "color-mix(in srgb, var(--color-text) 62%, transparent)" }}>
                  {f.v}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
