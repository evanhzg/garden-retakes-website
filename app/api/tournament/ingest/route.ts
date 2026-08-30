import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { finishMap } from "@/lib/tournament/matchRunner";

/**
 * Long enough for a match to start.
 *
 * startMatch changes the map and then polls the server until it appears, which
 * is up to thirty seconds before a single roster command is sent, followed by
 * roughly twenty more RCON round trips. That runs here — either inline or via
 * background(), which keeps the instance alive but does not exempt it from the
 * duration cap. On the default cap the sequence was being cut off partway,
 * leaving a half-declared match on the server.
 */
export const maxDuration = 120;

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
  | { kind: "player_stats"; players: PlayerLine[] }
  | { kind: "kill"; kill: KillLine }
  | { kind: "chat"; kill: KillLine }
  | { kind: "knife_result"; winner?: "A" | "B"; choice?: "stay" | "switch" };

/**
 * One kill, for the feed.
 *
 * Names travel with the ids because the feed is a record of what was on screen:
 * a bot has no profile to look up, and somebody renaming themselves next month
 * should not rewrite last month's match.
 */
type KillLine = {
  /** "kill", "defuse", "plant" or "round". */
  kind?: string;
  /** Round rows only: which side took it. */
  winnerSlot?: "A" | "B";
  /** Round rows only: how it was won. */
  reason?: string;
  round?: number;
  attackerSteamId?: string;
  attackerName?: string;
  attackerSlot?: "A" | "B";
  victimSteamId: string;
  victimName?: string;
  victimSlot?: "A" | "B";
  assisterSteamId?: string;
  assisterName?: string;
  assisterSlot?: "A" | "B";
  weapon?: string;
  headshot?: boolean;
  teamKill?: boolean;
  penetrated?: boolean;
  noScope?: boolean;
  throughSmoke?: boolean;
  attackerBlind?: boolean;
};

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

  // player_stats is a full snapshot written with an upsert, so replaying one
  // changes nothing — and exempting it fixes a real hole. The plugin resets its
  // sequence counter per MAP, while this set is keyed per MATCH for the life of
  // the process, so on the second map of a series every event arrived with a
  // seq the website had already seen and was silently discarded. A scoreboard
  // that works on map one and never updates again is exactly that bug.
  // player_stats and kill are exempt from the sequence check: the first is a
  // whole-table snapshot where a repeat is harmless, and the second is an
  // append where a genuine repeat (same pair, same weapon, seconds apart) is a
  // real event that must not be mistaken for a retry.
  if (
    body.kind !== "player_stats" &&
    body.kind !== "kill" &&
    body.kind !== "chat" &&
    isDuplicate(matchKey, body.seq)
  ) {
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

    // Who won the knife round, and which way it sent them. Written onto the map
    // it decided — which is the live one, or the next one still to be played
    // when the report lands during the moment between the knife and going live.
    /**
     * A kill, appended to the feed.
     *
     * Not deduplicated by seq. Two identical kills a second apart are a real
     * thing that happens — the same pair, the same weapon, in a retake — and
     * dropping the second would silently shorten the feed. The append is
     * cheap and a duplicate row is a cosmetic repeat, where a missing one is
     * a hole in the record.
     */
    case "kill": {
      const k = body.kill;
      if (!k) break;

      // A kill and a defuse are about a person and must name one. A round is
      // about a side and never does, so the check cannot be blanket.
      const kind = k.kind ?? "kill";
      if (kind !== "round" && !k.victimSteamId) break;

      const map = await mapForStats(match.Id);

      await prisma.tournamentKill.create({
        data: {
          MatchId: match.Id,
          MapOrdinal: map?.Ordinal ?? 0,
          Round: Number(k.round) || 0,
          AttackerSteamId: BigInt(k.attackerSteamId ?? "0"),
          AttackerName: k.attackerName?.slice(0, 64) ?? null,
          AttackerSlot: k.attackerSlot ?? null,
          Kind: kind.slice(0, 16),
          WinnerSlot: k.winnerSlot ?? null,
          Reason: k.reason?.slice(0, 24) ?? null,
          VictimSteamId: BigInt(k.victimSteamId || "0"),
          VictimName: k.victimName?.slice(0, 64) ?? null,
          VictimSlot: k.victimSlot ?? null,
          AssisterSteamId: BigInt(k.assisterSteamId ?? "0"),
          AssisterName: k.assisterName?.slice(0, 64) ?? null,
          AssisterSlot: k.assisterSlot ?? null,
          Weapon: (k.weapon ?? "").replace(/^weapon_/, "").slice(0, 32),
          Headshot: !!k.headshot,
          TeamKill: !!k.teamKill,
          Penetrated: !!k.penetrated,
          NoScope: !!k.noScope,
          ThroughSmoke: !!k.throughSmoke,
          AttackerBlind: !!k.attackerBlind,
        },
      });
      break;
    }

    /**
     * Somebody said something in the server.
     *
     * Stored as a room message with Source "game", so the match room shows one
     * conversation rather than two lists the page would have to interleave by
     * timestamp to get back into the order they already happened in.
     *
     * The role is taken from the plugin's own view of the rosters rather than
     * recomputed here: it knows who is on which side of THIS match, which is
     * the question, and it knew it at the moment the line was said.
     */
    case "chat": {
      const k = body.kill;
      if (!k?.victimSteamId || !k.reason) break;

      await prisma.tournamentRoomMessage.create({
        data: {
          MatchId: match.Id,
          SteamId: BigInt(k.victimSteamId),
          Name: k.victimName?.slice(0, 64) ?? null,
          Role: k.victimSlot ? k.victimSlot.toLowerCase() : null,
          Source: "game",
          Body: (k.kind === "chat_team" ? "[team] " : "") + k.reason.slice(0, 480),
        },
      });

      try {
        const io = (globalThis as { __gardenIo?: { emit: (e: string, p: unknown) => void } }).__gardenIo;
        io?.emit("t:room", { matchId: match.Id });
      } catch {
        /* the poll will catch it */
      }
      break;
    }

    case "knife_result": {
      const map = await mapForStats(match.Id);
      const winner = body.winner === "A" ? match.TeamAId : body.winner === "B" ? match.TeamBId : null;

      if (map && winner) {
        await prisma.tournamentMatchMap.update({
          where: { Id: map.Id },
          data: {
            KnifeWinnerTeamId: winner,
            KnifeChoice: body.choice === "switch" ? "switch" : "stay",
          },
        });
      }
      break;
    }

    default:
      return NextResponse.json({ error: "Unknown event." }, { status: 400 });
  }

  emit(matchKey, body);

  return NextResponse.json({ ok: true });
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0);

/**
 * Which map a stat line belongs to.
 *
 * The live one, and failing that the last one that has been reached. The
 * fallback matters because of ordering: the plugin sends the scoreboard just
 * before map_end, but a retry, a reconnect or a slow request can land after it
 * — and the old code wrote MapId 0 in that case, which matches no map row, so
 * the rows existed and the scoreboard could never find them. An orphan is worse
 * than an approximation here: nobody can see it, and the page just says there
 * are no stats.
 */
async function mapForStats(matchId: number) {
  const live = await prisma.tournamentMatchMap.findFirst({
    where: { MatchId: matchId, State: "live" },
    orderBy: { Ordinal: "asc" },
  });

  if (live) return live;

  return prisma.tournamentMatchMap.findFirst({
    where: { MatchId: matchId, State: { not: "pending" } },
    orderBy: { Ordinal: "desc" },
  });
}

async function savePlayerStats(matchId: number, players: PlayerLine[]) {
  const live = await mapForStats(matchId);

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

    // Skipped rather than written to MapId 0 when there is genuinely no map —
    // a stat row that belongs to nothing is invisible debris that the career
    // table still counts.
    if (!live) continue;

    await prisma.tournamentPlayerStat.upsert({
      where: {
        MatchId_MapId_SteamId: {
          MatchId: matchId,
          MapId: live.Id,
          SteamId: BigInt(line.steamId),
        },
      },
      create: { MatchId: matchId, MapId: live.Id, SteamId: BigInt(line.steamId), ...data },
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
