"use client";

import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
import AvatarImage from "@/components/AvatarImage";

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
    <main className="container p-4 mx-auto max-w-6xl mt-8">
      <Head>
        <title>Live Spectator - Garden Retakes</title>
      </Head>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
            <h1 className="text-2xl font-black uppercase tracking-widest text-red-500">
              Live
            </h1>
          </div>
          <div className="text-zinc-400 text-sm font-semibold uppercase tracking-wider mt-1">
            {match.Mode} • <span className="text-zinc-200">{match.Map}</span>
          </div>
        </div>

        {isAdmin && (
          <div className="panel bg-zinc-950 border border-red-900/30 flex items-center gap-3 p-3 !m-0">
            <span className="text-xs font-bold uppercase tracking-wider text-red-400 mr-2">Mod Controls</span>
            <select 
              className="input !py-1 !px-2 text-sm"
              onChange={(e) => {
                if(e.target.value) {
                  handleAdminAction(`css_gmap ${e.target.value}`);
                  e.target.value = "";
                }
              }}
              defaultValue=""
            >
              <option value="" disabled>Change Map...</option>
              {COMMON_MAPS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="Custom map..." 
                className="input !py-1 !px-2 text-sm w-32"
                value={customMap}
                onChange={e => setCustomMap(e.target.value)}
              />
              <button 
                className="btn small"
                onClick={() => {
                  if(customMap) handleAdminAction(`css_gmap ${customMap}`);
                }}
              >
                Go
              </button>
            </div>
          </div>
        )}
      </div>

      {match.IsCr && (
        <div className="panel mb-8 p-8 relative overflow-hidden bg-gradient-to-b from-zinc-900 to-black border border-zinc-800 shadow-2xl">
          <div className="absolute top-0 left-0 w-1/2 h-full bg-gradient-to-r from-amber-500/10 to-transparent pointer-events-none" />
          <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-blue-500/10 to-transparent pointer-events-none" />
          
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
            <div className="flex-1 text-center md:text-right">
              <h2 className="text-4xl font-black text-amber-400 mb-2">{match.TeamAName}</h2>
              <div className="text-xs text-zinc-400 font-bold uppercase tracking-widest bg-black/40 inline-block px-3 py-1 rounded">
                ELO if Win: <span className="text-emerald-400">{match.WinPredictionA.split("/")[0]}</span> • Loss: <span className="text-red-400">{match.WinPredictionA.split("/")[1]}</span>
              </div>
            </div>
            
            <div className="text-7xl font-black tabular-nums tracking-tighter flex items-center gap-6 text-white drop-shadow-xl">
              <span className={match.ScoreA > match.ScoreB ? "text-amber-400" : ""}>{match.ScoreA}</span>
              <span className="text-zinc-700 text-5xl font-light">-</span>
              <span className={match.ScoreB > match.ScoreA ? "text-blue-400" : ""}>{match.ScoreB}</span>
            </div>

            <div className="flex-1 text-center md:text-left">
              <h2 className="text-4xl font-black text-blue-400 mb-2">{match.TeamBName}</h2>
              <div className="text-xs text-zinc-400 font-bold uppercase tracking-widest bg-black/40 inline-block px-3 py-1 rounded">
                ELO if Win: <span className="text-emerald-400">{match.WinPredictionB.split("/")[0]}</span> • Loss: <span className="text-red-400">{match.WinPredictionB.split("/")[1]}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Players */}
      <div className={`grid gap-6 ${match.IsCr ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
        {match.IsCr ? (
          <>
            <PlayerTable teamName={match.TeamAName} players={teamA} isRanked={match.IsRanked} color="amber" isAdmin={isAdmin} onAdminAction={handleAdminAction} />
            <PlayerTable teamName={match.TeamBName} players={teamB} isRanked={match.IsRanked} color="blue" isAdmin={isAdmin} onAdminAction={handleAdminAction} />
          </>
        ) : (
          <PlayerTable teamName="Scoreboard" players={match.Players} isRanked={match.IsRanked} color="amber" isAdmin={isAdmin} onAdminAction={handleAdminAction} />
        )}
      </div>

      {/* Head to Head */}
      {match.HeadToHead && match.HeadToHead.length > 0 && (
        <div className="mt-8 panel border border-zinc-800/50 bg-black/40">
          <h3 className="text-xl font-black mb-4 text-emerald-400 uppercase tracking-wider">🔥 Head-to-Head Dominance</h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {match.HeadToHead.map((h2h, idx) => (
              <div key={idx} className="flex justify-between items-center p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 shadow-lg">
                <span className="font-bold text-white truncate max-w-[120px]">{h2h.KillerName}</span>
                <div className="flex flex-col items-center mx-2">
                  <span className="text-red-400 font-black px-3 py-1 bg-red-950/30 rounded border border-red-900/50 tabular-nums">
                    {h2h.Kills} - 0
                  </span>
                </div>
                <span className="text-zinc-500 truncate max-w-[120px]">{h2h.VictimName}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </main>
  );
}

function PlayerTable({ 
  teamName, 
  players, 
  isRanked, 
  color,
  isAdmin,
  onAdminAction
}: { 
  teamName: string, 
  players: LivePlayer[], 
  isRanked: boolean, 
  color: "amber" | "blue",
  isAdmin: boolean,
  onAdminAction: (cmd: string) => void
}) {
  const colorClass = color === "amber" ? "text-amber-400" : "text-blue-400";
  const bgClass = color === "amber" ? "from-amber-950/20" : "from-blue-950/20";
  const borderClass = color === "amber" ? "border-amber-900/20" : "border-blue-900/20";
  
  return (
    <div className={`panel border ${borderClass} bg-gradient-to-br ${bgClass} to-transparent overflow-x-auto`}>
      <h3 className={`text-2xl font-black mb-4 ${colorClass}`}>{teamName}</h3>
      <table className="w-full text-left border-collapse min-w-[500px]">
        <thead>
          <tr className={`border-b ${borderClass} text-xs uppercase tracking-wider text-zinc-500`}>
            <th className="py-3 px-2 font-black">Player</th>
            <th className="py-3 px-2 text-right font-black">K</th>
            <th className="py-3 px-2 text-right font-black">A</th>
            <th className="py-3 px-2 text-right font-black">D</th>
            <th className="py-3 px-2 text-right font-black">DMG</th>
            <th className="py-3 px-2 text-right font-black text-emerald-400">Rating</th>
            {isAdmin && <th className="py-3 px-2 text-right font-black text-red-500">Mod</th>}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {players.sort((a, b) => b.Kills - a.Kills).map((p) => {
            const rating = ((p.Kills * 1) + (p.Assists * 0.5) + (p.Damage * 0.01)) / Math.max(1, p.Deaths);
            return (
              <tr key={p.SteamId} className={`border-b ${borderClass} last:border-0 hover:bg-white/[0.04] transition-colors`}>
                <td className="py-3 px-2">
                  <div className="flex items-center gap-3">
                    <Link href={`/players/${p.SteamId}`} className="shrink-0">
                      {/* Steam avatar, resolved and cached by AvatarImage —
                          this used to point at a local /<steamId>_pp.png. */}
                      <AvatarImage
                        steamId={String(p.SteamId)}
                        alt={p.Name}
                        className="shadow-md border border-zinc-800 bg-zinc-900"
                      />
                    </Link>
                    <div className="flex flex-col">
                      <Link href={`/players/${p.SteamId}`} className="font-bold text-white hover:text-emerald-400 transition truncate max-w-[150px]">
                        {p.Name}
                      </Link>
                      {isRanked && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">ELO</span>
                          <span className="text-xs font-black text-accent">{p.Elo}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-3 px-2 text-right font-semibold text-white">{p.Kills}</td>
                <td className="py-3 px-2 text-right font-medium text-zinc-400">{p.Assists}</td>
                <td className="py-3 px-2 text-right font-medium text-zinc-400">{p.Deaths}</td>
                <td className="py-3 px-2 text-right font-medium text-zinc-500">{p.Damage}</td>
                <td className="py-3 px-2 text-right">
                  <span className={`font-black px-2 py-1 rounded bg-black/40 border border-zinc-800 ${rating >= 1.0 ? 'text-emerald-400' : 'text-zinc-400'}`}>
                    {rating.toFixed(2)}
                  </span>
                </td>
                {isAdmin && (
                  <td className="py-3 px-2 text-right">
                    <button 
                      onClick={() => onAdminAction(`css_gkick ${p.SteamId}`)}
                      className="p-1.5 rounded bg-red-950/40 text-red-500 hover:bg-red-900/60 transition border border-red-900/50"
                      title={`Kick ${p.Name}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                      </svg>
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
          {players.length === 0 && (
            <tr>
              <td colSpan={isAdmin ? 7 : 6} className="py-8 text-center text-zinc-500 italic font-medium">
                No players currently assigned.
              </td>
            </tr>
          )}
        </tbody>
      </table>
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
    <main style={{ padding: "clamp(48px, 8vw, 96px) clamp(20px, 5vw, 64px)" }}>
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
                Join the server
              </a>
              <button type="button" className="btn btn-secondary" onClick={copy}>
                {copied ? "Copied" : `Copy connect ${serverAddress}`}
              </button>
            </>
          )}
          <Link className="btn btn-secondary" href="/">
            Ladder
          </Link>
          <Link className="btn btn-secondary" href="/stats">
            Season stats
          </Link>
        </div>

        <div style={{ borderTop: "2px solid var(--color-divider)", paddingTop: 28 }}>
          <h2 style={{ fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 20 }}>
            What appears here during a match
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
