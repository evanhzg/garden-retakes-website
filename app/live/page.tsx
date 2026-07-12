"use client";

import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";

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

export default function LiveMatchPage() {
  const [match, setMatch] = useState<LiveMatchData | null>(null);
  const [isLive, setIsLive] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLiveMatch = async () => {
      try {
        const res = await fetch("/api/live");
        if (res.ok) {
          const json = await res.json();
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

  if (loading) {
    return (
      <main className="container p-4 mx-auto max-w-5xl mt-12 text-center">
        <h1 className="text-3xl font-black mb-4">Connecting to Server...</h1>
        <p className="text-zinc-400">Fetching live match data...</p>
      </main>
    );
  }

  if (!isLive || !match) {
    return (
      <main className="container p-4 mx-auto max-w-5xl mt-12 text-center">
        <h1 className="text-4xl font-black mb-4 text-zinc-300">No Live Match</h1>
        <p className="text-zinc-500 mb-8">
          The server is currently idle or playing a warmup mode.
        </p>
        <Link href="/" className="px-6 py-2 bg-emerald-600/20 text-emerald-400 rounded hover:bg-emerald-600/40 transition">
          Return Home
        </Link>
      </main>
    );
  }

  const teamA = match.Players.filter(p => p.Team === "A");
  const teamB = match.Players.filter(p => p.Team === "B");

  return (
    <main className="container p-4 mx-auto max-w-5xl mt-8">
      <Head>
        <title>Live Spectator - Garden Retakes</title>
      </Head>

      <div className="flex justify-between items-center mb-10">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
          <h1 className="text-2xl font-black uppercase tracking-widest text-red-500">
            Live
          </h1>
        </div>
        <div className="text-zinc-400 text-sm font-semibold uppercase tracking-wider">
          {match.Mode} • {match.Map}
        </div>
      </div>

      {match.IsCr && (
        <div className="panel mb-8 p-8 relative overflow-hidden bg-gradient-to-b from-zinc-900 to-zinc-950 border border-zinc-800">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex-1 text-center md:text-right">
              <h2 className="text-4xl font-black text-amber-400 mb-2">{match.TeamAName}</h2>
              <div className="text-xs text-zinc-500 font-bold uppercase tracking-widest">
                ELO if Win: <span className="text-emerald-400">{match.WinPredictionA.split("/")[0]}</span> • Loss: <span className="text-red-400">{match.WinPredictionA.split("/")[1]}</span>
              </div>
            </div>
            
            <div className="text-7xl font-black tabular-nums tracking-tighter flex items-center gap-4 text-white">
              <span>{match.ScoreA}</span>
              <span className="text-zinc-700 text-5xl">-</span>
              <span>{match.ScoreB}</span>
            </div>

            <div className="flex-1 text-center md:text-left">
              <h2 className="text-4xl font-black text-blue-400 mb-2">{match.TeamBName}</h2>
              <div className="text-xs text-zinc-500 font-bold uppercase tracking-widest">
                ELO if Win: <span className="text-emerald-400">{match.WinPredictionB.split("/")[0]}</span> • Loss: <span className="text-red-400">{match.WinPredictionB.split("/")[1]}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Players */}
      <div className={`grid gap-6 ${match.IsCr ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
        {match.IsCr ? (
          <>
            <PlayerTable teamName={match.TeamAName} players={teamA} isRanked={match.IsRanked} color="amber" />
            <PlayerTable teamName={match.TeamBName} players={teamB} isRanked={match.IsRanked} color="blue" />
          </>
        ) : (
          <PlayerTable teamName="Scoreboard" players={match.Players} isRanked={match.IsRanked} color="amber" />
        )}
      </div>

      {/* Head to Head */}
      {match.HeadToHead && match.HeadToHead.length > 0 && (
        <div className="mt-8 panel border border-zinc-800/50">
          <h3 className="text-xl font-bold mb-4 text-emerald-400">🔥 Head-to-Head</h3>
          <div className="grid md:grid-cols-2 gap-4">
            {match.HeadToHead.map((h2h, idx) => (
              <div key={idx} className="flex justify-between items-center p-3 rounded bg-white/[0.02] border border-white/[0.05]">
                <span className="font-bold">{h2h.KillerName}</span>
                <span className="text-red-400 font-black px-2 tabular-nums">{h2h.Kills} - 0</span>
                <span className="text-zinc-500">{h2h.VictimName}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </main>
  );
}

function PlayerTable({ teamName, players, isRanked, color }: { teamName: string, players: LivePlayer[], isRanked: boolean, color: "amber" | "blue" }) {
  const colorClass = color === "amber" ? "text-amber-400" : "text-blue-400";
  
  return (
    <div className="panel border border-zinc-800/50">
      <h3 className={`text-xl font-bold mb-4 ${colorClass}`}>{teamName} Roster</h3>
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-500">
            <th className="py-2 font-medium">Player</th>
            <th className="py-2 text-right font-medium">K</th>
            <th className="py-2 text-right font-medium">A</th>
            <th className="py-2 text-right font-medium">D</th>
            <th className="py-2 text-right font-medium">DMG</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {players.sort((a, b) => b.Kills - a.Kills).map((p) => (
            <tr key={p.SteamId} className="border-b border-zinc-800/50 last:border-0 hover:bg-white/[0.02]">
              <td className="py-3 font-semibold">
                <Link href={`/players/${p.SteamId}`} className="hover:text-emerald-400 transition">
                  {p.Name}
                </Link>
                {isRanked && <span className="ml-2 text-xs text-accent font-bold">[{p.Elo}]</span>}
              </td>
              <td className="py-3 text-right text-white">{p.Kills}</td>
              <td className="py-3 text-right text-zinc-400">{p.Assists}</td>
              <td className="py-3 text-right text-zinc-400">{p.Deaths}</td>
              <td className="py-3 text-right text-zinc-500">{p.Damage}</td>
            </tr>
          ))}
          {players.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-center text-zinc-500 italic">No players</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
