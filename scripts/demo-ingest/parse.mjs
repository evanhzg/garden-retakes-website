/**
 * CS2 demo -> the same per-round metric shape lib/leetify.ts already scores.
 *
 * The point of matching that shape is that a FACEIT demo and a Garden round
 * become directly comparable — which is the whole "break the barrier between
 * server data and real performance" idea. Anything the demo gives us that the
 * game server cannot (grenade landing coordinates, opening-duel positions) is
 * carried in the extra fields at the bottom.
 */

import {
  parseEvents,
  parseGrenades,
  parseHeader,
  parsePlayerInfo,
} from "@laihoe/demoparser2";

const TEAM_T = 2;
const TEAM_CT = 3;

/** Rounds a value so the benchmark files stay small and diffable. */
const r2 = (n) => Math.round(n * 100) / 100;

/**
 * Parses one demo into per-player-per-round rows.
 *
 * demoparser2 is synchronous and holds the whole demo in memory, so callers
 * should run this one file at a time rather than mapping it over an array.
 */
export function parseDemo(path) {
  const header = parseHeader(path);
  const players = parsePlayerInfo(path);

  const events = parseEvents(
    path,
    ["player_death", "round_end", "round_start", "flashbang_detonate", "player_hurt", "bomb_planted", "bomb_defused"],
    ["total_rounds_played", "team_num", "is_alive"],
    ["is_warmup_period"],
  );

  const byType = (t) => events.filter((e) => e.event_name === t);

  const deaths = byType("player_death").filter((e) => !e.is_warmup_period);
  const hurts = byType("player_hurt").filter((e) => !e.is_warmup_period);
  const roundEnds = byType("round_end").filter((e) => !e.is_warmup_period);
  const roundStarts = byType("round_start").filter((e) => !e.is_warmup_period);
  const plants = byType("bomb_planted").filter((e) => !e.is_warmup_period);
  const defuses = byType("bomb_defused").filter((e) => !e.is_warmup_period);

  // round index -> tick window, so every event can be attributed to a round.
  const rounds = [];
  for (let i = 0; i < roundStarts.length; i++) {
    const start = roundStarts[i].tick;
    const end = roundEnds[i]?.tick ?? Infinity;
    rounds.push({ index: i, start, end, winner: roundEnds[i]?.winner ?? null });
  }
  const roundOf = (tick) => rounds.find((r) => tick >= r.start && tick <= r.end) ?? null;

  const tickRate = header?.tick_rate ?? 64;

  /** steamid -> { round -> row } */
  const acc = new Map();
  const rowFor = (steamid, name, roundIdx) => {
    if (!steamid) return null;
    if (!acc.has(steamid)) acc.set(steamid, new Map());
    const perRound = acc.get(steamid);
    if (!perRound.has(roundIdx)) {
      perRound.set(roundIdx, {
        steamid: String(steamid),
        name,
        round: roundIdx,
        Kills: 0, Headshots: 0, Assists: 0, FlashAssists: 0,
        Damage: 0, UtilityDamage: 0, EnemiesFlashed: 0, EnemyBlindDuration: 0,
        Died: false, DiedAtSeconds: null, KilledTeammate: false, WasTeamKilled: false,
        DiedEarly: false, OpeningKill: false, OpeningDeath: false,
        TradeKills: 0, TradedDeath: false, Kast: false, MultiKillCount: 0,
        ClutchVersus: 0, ClutchWon: false, BombPlanted: false, BombDefused: false,
        WasAfk: false, WonRound: false, TeamNum: 0, Rating: 0, EloDelta: 0,
      });
    }
    return perRound.get(roundIdx);
  };

  // ---- deaths, opening duels, trades ----
  const TRADE_WINDOW_TICKS = tickRate * 5; // 5s is the usual trade definition
  const deathsByRound = new Map();
  for (const d of deaths) {
    const rd = roundOf(d.tick);
    if (!rd) continue;
    if (!deathsByRound.has(rd.index)) deathsByRound.set(rd.index, []);
    deathsByRound.get(rd.index).push(d);
  }

  for (const [roundIdx, list] of deathsByRound) {
    list.sort((a, b) => a.tick - b.tick);
    const rd = rounds[roundIdx];

    list.forEach((d, i) => {
      const victim = rowFor(d.user_steamid, d.user_name, roundIdx);
      const killer = d.attacker_steamid ? rowFor(d.attacker_steamid, d.attacker_name, roundIdx) : null;

      if (victim) {
        victim.Died = true;
        victim.DiedAtSeconds = r2((d.tick - rd.start) / tickRate);
        victim.DiedEarly = victim.DiedAtSeconds < 15;
        if (i === 0) victim.OpeningDeath = true;
        // Traded if an enemy dies shortly after this death.
        victim.TradedDeath = list.some(
          (o) => o.tick > d.tick && o.tick - d.tick <= TRADE_WINDOW_TICKS &&
            o.user_steamid !== d.user_steamid && o.attacker_steamid !== d.attacker_steamid,
        );
      }

      if (killer && d.attacker_steamid !== d.user_steamid) {
        killer.Kills += 1;
        if (d.headshot) killer.Headshots += 1;
        if (i === 0) killer.OpeningKill = true;
        // This kill trades a teammate who died just before.
        const traded = list.some(
          (o) => o.tick < d.tick && d.tick - o.tick <= TRADE_WINDOW_TICKS &&
            o.attacker_steamid === d.user_steamid,
        );
        if (traded) killer.TradeKills += 1;
      }

      if (d.assister_steamid) {
        const a = rowFor(d.assister_steamid, d.assister_name, roundIdx);
        if (a) {
          a.Assists += 1;
          if (d.assistedflash) a.FlashAssists += 1;
        }
      }
    });
  }

  // ---- damage ----
  for (const h of hurts) {
    const rd = roundOf(h.tick);
    if (!rd || !h.attacker_steamid) continue;
    const row = rowFor(h.attacker_steamid, h.attacker_name, rd.index);
    if (!row) continue;
    const dmg = h.dmg_health ?? 0;
    row.Damage += dmg;
    if (["hegrenade", "molotov", "inferno", "flashbang", "smokegrenade"].includes(h.weapon)) {
      row.UtilityDamage += dmg;
    }
  }

  // ---- flashes ----
  for (const f of byType("flashbang_detonate")) {
    const rd = roundOf(f.tick);
    if (!rd || !f.user_steamid) continue;
    const row = rowFor(f.user_steamid, f.user_name, rd.index);
    if (row) row.EnemiesFlashed += 1;
  }

  // ---- objectives ----
  for (const [list, field] of [[plants, "BombPlanted"], [defuses, "BombDefused"]]) {
    for (const e of list) {
      const rd = roundOf(e.tick);
      if (!rd || !e.user_steamid) continue;
      const row = rowFor(e.user_steamid, e.user_name, rd.index);
      if (row) row[field] = true;
    }
  }

  // ---- multi-kills, KAST, win flags ----
  const out = [];
  for (const [steamid, perRound] of acc) {
    const info = players.find((p) => String(p.steamid) === String(steamid));
    for (const [roundIdx, row] of perRound) {
      row.MultiKillCount = row.Kills;
      // KAST: kill, assist, survived, or was traded.
      row.Kast = row.Kills > 0 || row.Assists > 0 || !row.Died || row.TradedDeath;
      row.name = row.name ?? info?.name ?? "unknown";
      row.map = header?.map_name ?? "unknown";
      out.push(row);
    }
  }

  // ---- grenade landings: the bit the game server cannot give us ----
  let grenades = [];
  try {
    const g = parseGrenades(path);
    // One row per tick of flight; the last tick of each entity is where it came
    // to rest, which is the only point that matters for lineup clustering.
    const lastByEntity = new Map();
    for (const t of g) lastByEntity.set(t.entity_id, t);
    grenades = Array.from(lastByEntity.values()).map((t) => ({
      steamid: String(t.steamid ?? ""),
      type: t.grenade_type,
      x: r2(t.X), y: r2(t.Y), z: r2(t.Z),
      map: header?.map_name ?? "unknown",
    }));
  } catch {
    // Grenade trajectories are optional; a demo without them still scores.
  }

  return {
    map: header?.map_name ?? "unknown",
    tickRate,
    rounds: rounds.length,
    rows: out,
    grenades,
  };
}
