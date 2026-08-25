import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { finishMap } from "@/lib/tournament/matchRunner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// What the game reports back.
//
// One route for every event rather than one per kind, because they share
// authentication, the match lookup and the idempotency rule, and splitting them
// would mean four copies of all three.
//
// **Idempotent on (matchKey, seq).** A plugin that retries after a timeout, or a
// server that reconnects mid-match, must not score a round twice — and a
// duplicate round is not a visible bug, it is a scoreboard that is quietly one
// ahead for the rest of the match.

type Event =
  | { kind: "going_live"; map?: string }
  | { kind: "round_end"; scoreA: number; scoreB: number; round?: number }
  | { kind: "map_end"; scoreA: number; scoreB: number }
  | { kind: "match_end"; scoreA: number; scoreB: number }
  | { kind: "player_stats"; players: PlayerLine[] };

type PlayerLine = {
  steamId: string;
  teamSlot?: "A" | "B";
  kills?: number;
  deaths?: number;
  assists?: number;
  headshots?: number;
  damage?: number;
  utilityDamage?: number;
  entryKills?: number;
  entryDeaths?: number;
  clutches?: number;
  roundsPlayed?: number;
  kastRounds?: number;
};

type Incoming = { apiKey?: string; matchKey?: string; seq?: number } & Partial<Event>;

/** Seen sequence numbers, per match, for the life of the process. */
const seen = new Map<string, Set<number>>();

function isDuplicate(matchKey: string, seq: number | undefined): boolean {
  if (seq === undefined) return false;

  let set = seen.get(matchKey);
  if (!set) {
    set = new Set();
    seen.set(matchKey, set);

    // A tournament is a few dozen matches; this is bounded by that rather than
    // growing forever, and it is deliberately in memory — a restart mid-match
    // costing one duplicate check is a better trade than a write per round.
    if (seen.size > 64) {
      const oldest = seen.keys().next().value;
      if (oldest) seen.delete(oldest);
    }
  }

  if (set.has(seq)) return true;
  set.add(seq);
  return false;
}

export async function POST(req: Request) {
  let body: Incoming;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
  }

  const key = process.env.INVSIM_API_KEY;
  if (!key || body.apiKey !== key) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const matchKey = (body.matchKey ?? "").trim();
  if (!matchKey) {
    return NextResponse.json({ error: "matchKey is required." }, { status: 400 });
  }

  if (isDuplicate(matchKey, body.seq)) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const match = await prisma.tournamentMatch.findUnique({ where: { MatchKey: matchKey } });
  if (!match) {
    // Not an error worth failing on: a plugin reporting a match the site does
    // not know about is a match somebody started by hand, and refusing it would
    // make the plugin retry forever.
    return NextResponse.json({ ok: true, known: false });
  }

  switch (body.kind) {
    case "going_live": {
      await prisma.tournamentMatch.update({
        where: { Id: match.Id },
        data: { State: "live", StartedAt: match.StartedAt ?? new Date() },
      });
      break;
    }

    case "round_end": {
      // The live map's running score. The match's own score counts MAPS won, so
      // it is deliberately not touched here.
      const live = await prisma.tournamentMatchMap.findFirst({
        where: { MatchId: match.Id, State: "live" },
        orderBy: { Ordinal: "asc" },
      });

      if (live) {
        await prisma.tournamentMatchMap.update({
          where: { Id: live.Id },
          data: { ScoreA: num(body.scoreA), ScoreB: num(body.scoreB) },
        });
      }
      break;
    }

    case "map_end":
    case "match_end": {
      await finishMap(matchKey, num(body.scoreA), num(body.scoreB));
      break;
    }

    case "player_stats": {
      await savePlayerStats(match.Id, body.players ?? []);
      break;
    }

    default:
      return NextResponse.json({ error: "Unknown event." }, { status: 400 });
  }

  emit(matchKey, body);

  return NextResponse.json({ ok: true });
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0);

async function savePlayerStats(matchId: number, players: PlayerLine[]) {
  const live = await prisma.tournamentMatchMap.findFirst({
    where: { MatchId: matchId, State: "live" },
    orderBy: { Ordinal: "asc" },
  });

  for (const line of players) {
    if (!/^\d{17}$/.test(line.steamId ?? "")) continue;

    const data = {
      Kills: num(line.kills),
      Deaths: num(line.deaths),
      Assists: num(line.assists),
      Headshots: num(line.headshots),
      Damage: num(line.damage),
      UtilityDamage: num(line.utilityDamage),
      EntryKills: num(line.entryKills),
      EntryDeaths: num(line.entryDeaths),
      Clutches: num(line.clutches),
      RoundsPlayed: num(line.roundsPlayed),
      KastRounds: num(line.kastRounds),
      Rating: rating(line),
    };

    await prisma.tournamentPlayerStat.upsert({
      where: {
        MatchId_MapId_SteamId: {
          MatchId: matchId,
          MapId: live?.Id ?? 0,
          SteamId: BigInt(line.steamId),
        },
      },
      create: { MatchId: matchId, MapId: live?.Id ?? 0, SteamId: BigInt(line.steamId), ...data },
      update: data,
    });
  }
}

/**
 * A rating in the HLTV mould, computed here rather than in the plugin so the
 * formula can be changed without a redeploy of six servers.
 */
function rating(line: PlayerLine): number {
  const rounds = Math.max(1, num(line.roundsPlayed));
  const kpr = num(line.kills) / rounds;
  const dpr = num(line.deaths) / rounds;
  const adr = num(line.damage) / rounds;
  const kast = num(line.kastRounds) / rounds;

  const value = 0.0073 * (kast * 100) + 0.3591 * kpr - 0.5329 * dpr + 0.2372 * (adr / 20) + 0.0032;
  return Math.max(0, Math.round(value * 100) / 100);
}

/** Best-effort push to anyone watching. The row is already written. */
function emit(matchKey: string, body: Incoming) {
  try {
    const io = (globalThis as { __gardenIo?: { emit: (e: string, p: unknown) => void } }).__gardenIo;
    const scored = body as { scoreA?: number; scoreB?: number };
    io?.emit("t:match", { matchKey, kind: body.kind, scoreA: scored.scoreA, scoreB: scored.scoreB });
  } catch {
    // Nothing to do here.
  }
}
