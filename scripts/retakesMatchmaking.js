"use strict";

/**
 * Competitive retakes matchmaking: parties, queues, the accept window, and the
 * map veto.
 *
 * Self-contained and namespaced under `rq:` so it cannot collide with the
 * mini-game lobby events that already live on this socket server. It owns no
 * database tables — a queue is a thing that exists for ninety seconds, and
 * persisting it would only create rows that outlive their meaning.
 *
 * The one design decision worth stating: every server→client message is the
 * whole of the state that player can see (`rq:state`), not a delta. Deltas are
 * how a lobby ends up showing four players to one person and five to another,
 * and there is no amount of state here worth optimising for — a party is at
 * most three people and a match at most six.
 *
 * Bots fill empty slots after a grace period rather than never. A queue with
 * one real person in it has to do something, and "wait for five strangers" is
 * not it on a server this size.
 */

// Both modes are retakes — the only thing that differs is how many people are
// on a side. They were briefly labelled Wingman and Trios, which named two
// different game modes we do not run and pointed 2v2 at the Wingman map pool.
const MODES = {
  "2v2": { id: "2v2", teamSize: 2, label: "Retakes", pool: "retakes" },
  "3v3": { id: "3v3", teamSize: 3, label: "Retakes", pool: "retakes" },
};

// Active duty plus Overpass, Train and Vertigo — the ten maps the site has
// calibrated radars and art for, which is the same list.
const MAP_POOLS = {
  retakes: [
    "de_ancient", "de_anubis", "de_cache", "de_dust2", "de_inferno",
    "de_mirage", "de_nuke", "de_overpass", "de_train", "de_vertigo",
  ],
};

const BOT_NAMES = [
  "f0rest", "GeT_RiGhT", "s1mple", "dev1ce", "ZywOo", "NiKo", "kennyS",
  "coldzera", "olofmeister", "dupreeh", "electronic", "sh1ro", "m0NESY",
];

/** How long a solo queue waits for humans before bots are offered. */
const BOT_FILL_MS = 15_000;
/** How long everyone has to accept a found match. */
const ACCEPT_MS = 20_000;
/** How long one veto turn lasts before it is taken automatically. */
const VETO_TURN_MS = 25_000;
/** How long a completed match stays on screen before the lobby resets. */
const READY_LINGER_MS = 15 * 60_000;

const STARTING_ELO = 1000;

/**
 * Which side of the rating range a mixed party is judged on.
 *
 * A pair of 1800s queueing with a 900 is not an average-1500 team — they will
 * run the game and the third will be a passenger. Weighting the mean towards
 * the top makes the lobby they get matched into closer to the game they will
 * actually play. The skew scales with the party's own spread, so an evenly
 * matched trio is still judged on its average.
 *
 * Mirrors effectiveElo() in lib/competitive.ts. Kept as a copy rather than an
 * import because this file is CommonJS on the socket server and that one is
 * TypeScript in the Next build.
 */
function effectiveElo(ratings) {
  if (ratings.length === 0) return STARTING_ELO;
  if (ratings.length === 1) return ratings[0];
  const mean = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  const top = Math.max(...ratings);
  const spread = top - Math.min(...ratings);
  const skew = Math.max(0, Math.min(1, (spread - 150) / 450));
  return Math.round(mean + (top - mean) * skew);
}

/** How far apart two parties may be, widening the longer they have waited. */
const acceptableGap = (secondsWaiting) => 100 + Math.min(900, secondsWaiting * 12);

const now = () => Date.now();
const uid = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

function attachRetakesMatchmaking(io, { connectedUsers, loadRatings, prisma }) {
  /** partyId -> party */
  const parties = new Map();
  /** steamId -> partyId */
  const partyOf = new Map();
  /** steamId -> { partyId, from, at } */
  const invites = new Map();
  /** mode -> [partyId] in join order */
  const queues = new Map(Object.keys(MODES).map((m) => [m, []]));
  /** matchId -> match */
  const matches = new Map();
  /** steamId -> matchId */
  const matchOf = new Map();
  /** partyId -> timeout */
  const botTimers = new Map();
  /** matchId -> timeout */
  const matchTimers = new Map();

  // ------------------------------------------------------------------ helpers

  const socketFor = (steamId) => connectedUsers.get(String(steamId));

  const emitTo = (steamId, event, payload) => {
    const sid = socketFor(steamId);
    if (sid) io.to(sid).emit(event, payload);
  };

  const partyFor = (steamId) => {
    const id = partyOf.get(String(steamId));
    return id ? parties.get(id) ?? null : null;
  };

  async function makeParty(steamId, name, lobbyId) {
    const ANIMAL_NAMES = ["Lions", "Tigers", "Bears", "Wolves", "Eagles", "Sharks", "Panthers", "Hawks", "Cobras", "Dragons"];
    const id = lobbyId || uid("p");
    const party = {
      id,
      leader: String(steamId),
      name: ANIMAL_NAMES[Math.floor(Math.random() * ANIMAL_NAMES.length)], // Custom team name
      members: [{ steamId: String(steamId), name: name ?? null, ready: true, elo: STARTING_ELO, matches: 0 }],
      mode: "2v2",
      queuedAt: null,
      createdAt: now(),
    };
    parties.set(id, party);
    partyOf.set(String(steamId), id);
    if (prisma) {
      await prisma.retakesLobby.upsert({
        where: { Id: id },
        create: { Id: id, LeaderId: BigInt(steamId), Mode: "2v2" },
        update: {}
      }).catch(console.error);
    }
    return party;
  }

  async function ensureParty(steamId, name, lobbyId) {
    let p = partyFor(steamId);
    if (!p) {
      if (lobbyId && parties.has(lobbyId)) {
        p = parties.get(lobbyId);
        if (p.members.length < partyCapacity(p)) {
          p.members.push({ steamId: String(steamId), name: name ?? null, ready: true, elo: STARTING_ELO, matches: 0 });
          partyOf.set(String(steamId), lobbyId);
        } else {
          p = await makeParty(steamId, name);
        }
      } else if (lobbyId && prisma) {
        const dbLobby = await prisma.retakesLobby.findUnique({ where: { Id: lobbyId } }).catch(() => null);
        if (dbLobby) {
          p = {
            id: dbLobby.Id,
            leader: String(steamId),
            name: ["Lions", "Tigers", "Bears", "Wolves", "Eagles"][Math.floor(Math.random() * 5)], // Custom team name
            members: [{ steamId: String(steamId), name: name ?? null, ready: true, elo: STARTING_ELO, matches: 0 }],
            mode: dbLobby.Mode,
            queuedAt: null,
            createdAt: now(),
          };
          parties.set(dbLobby.Id, p);
          partyOf.set(String(steamId), dbLobby.Id);
        } else {
          p = await makeParty(steamId, name, lobbyId);
        }
      } else {
        p = await makeParty(steamId, name, lobbyId);
      }
    }
    return p;
  }

  /** The rating a party is matched on. */
  const partyElo = (party) => effectiveElo(party.members.map((m) => m.elo ?? STARTING_ELO));

  /** Fill in ratings for whoever we do not have yet. Never fatal. */
  async function refreshRatings(party) {
    if (typeof loadRatings !== "function" || !party) return;
    try {
      const rows = await loadRatings(party.members.map((m) => m.steamId));
      for (const m of party.members) {
        const r = rows?.[m.steamId];
        if (!r) continue;
        m.elo = r.elo ?? STARTING_ELO;
        m.matches = r.matches ?? 0;
      }
    } catch {
      // A lobby without ratings still matches — everyone is simply treated as
      // a new player, which is what they would be if the table were empty.
    }
  }

  /** A party can never hold more people than a whole team. */
  const partyCapacity = (party) => MODES[party.mode]?.teamSize ?? 2;

  function leaveQueue(party, reason) {
    if (!party?.queuedAt) return;
    const q = queues.get(party.mode);
    const i = q ? q.indexOf(party.id) : -1;
    if (i >= 0) q.splice(i, 1);
    party.queuedAt = null;
    party.queueReason = reason ?? null;
    const t = botTimers.get(party.id);
    if (t) {
      clearTimeout(t);
      botTimers.delete(party.id);
    }
  }

  function disbandParty(party) {
    if (!party) return;
    leaveQueue(party);
    for (const m of party.members) partyOf.delete(m.steamId);
    parties.delete(party.id);
  }

  // ------------------------------------------------------------------- state

  /** Everything one player is allowed to know, in one object. */
  function stateFor(steamId) {
    const id = String(steamId);
    const party = partyFor(id);
    const matchId = matchOf.get(id);
    const match = matchId ? matches.get(matchId) : null;
    const invite = invites.get(id) ?? null;

    return {
      modes: Object.values(MODES).map((m) => ({ id: m.id, label: m.label, teamSize: m.teamSize })),
      party: party && {
        id: party.id,
        leader: party.leader,
        isLeader: party.leader === id,
        name: party.name,
        mode: party.mode,
        capacity: partyCapacity(party),
        members: party.members,
        elo: partyElo(party),
        queuedAt: party.queuedAt,
        queueReason: party.queueReason ?? null,
      },
      invite: invite && { partyId: invite.partyId, from: invite.from, fromName: invite.fromName, at: invite.at },
      queue: party?.queuedAt
        ? {
            mode: party.mode,
            since: party.queuedAt,
            searching: queuedPlayerCount(party.mode),
            botFillAt: party.queuedAt + BOT_FILL_MS,
          }
        : null,
      match: match ? publicMatch(match, id) : null,
      online: connectedUsers.size,
    };
  }

  function queuedPlayerCount(mode) {
    const q = queues.get(mode) ?? [];
    return q.reduce((n, pid) => n + (parties.get(pid)?.members.length ?? 0), 0);
  }

  function publicMatch(match, viewerId) {
    const mine = match.teams.findIndex((t) => t.players.some((p) => p.steamId === viewerId));
    return {
      id: match.id,
      mode: match.mode,
      phase: match.phase,
      yourTeam: mine < 0 ? null : mine,
      teams: match.teams.map((t, i) => ({
        index: i,
        name: t.name,
        side: t.side ?? null,
        players: t.players.map((p) => ({
          steamId: p.steamId,
          name: p.name,
          bot: !!p.bot,
          accepted: !!p.accepted,
          leader: !!p.leader,
          elo: p.elo ?? STARTING_ELO,
          matches: p.matches ?? 0,
          // Which party this player queued with, as a small index rather than
          // the raw id: it is what lets the roster show "these two came
          // together and this one is solo" without leaking party ids around.
          premade: p.premade ?? null,
        })),
      })),
      accept: match.phase === "found" ? { deadline: match.acceptDeadline, total: match.humanCount, done: match.acceptedCount } : null,
      veto: match.phase === "veto" || match.phase === "ready"
        ? {
            pool: match.pool,
            actions: match.actions,
            turn: match.turn,
            turnDeadline: match.turnDeadline,
            yourTurn: mine >= 0 && match.turn === mine && match.phase === "veto",
            remaining: match.remaining,
            step: match.stepIndex,
            plan: match.plan,
          }
        : null,
      result: match.phase === "ready" ? { map: match.map, connect: match.connect, sides: match.teams.map((t) => t.side) } : null,
      chat: match.chat.slice(-40),
    };
  }

  /** Push fresh state to everyone who can see it. */
  function syncParty(party) {
    if (!party) return;
    for (const m of party.members) emitTo(m.steamId, "rq:state", stateFor(m.steamId));
  }

  function syncMatch(match) {
    for (const t of match.teams) {
      for (const p of t.players) {
        if (!p.bot) emitTo(p.steamId, "rq:state", stateFor(p.steamId));
      }
    }
  }

  function syncQueue(mode) {
    for (const pid of queues.get(mode) ?? []) syncParty(parties.get(pid));
  }

  // -------------------------------------------------------------- match-making

  function tryMatch(mode) {
    const cfg = MODES[mode];
    const q = queues.get(mode);
    if (!cfg || !q) return;
    const needed = cfg.teamSize * 2;

    // Anchored on whoever has waited longest, then filled from the parties
    // closest to them in rating. Pure join order made a level 2 and a level 9
    // a match simply because they queued a second apart; ordering the
    // candidates by rating distance means the lobby is built around the person
    // who has been waiting rather than around the clock.
    //
    // The tolerance widens with that wait, so a queue with nobody suitable in
    // it still resolves rather than leaving one person there forever.
    const head = q.map((pid) => parties.get(pid)).find(Boolean);
    if (!head) return;

    const waited = (now() - (head.queuedAt ?? now())) / 1000;
    const tolerance = acceptableGap(waited);
    const anchor = partyElo(head);

    const candidates = q
      .map((pid) => parties.get(pid))
      .filter((party) => party && party.id !== head.id)
      .map((party) => ({ party, distance: Math.abs(partyElo(party) - anchor) }))
      .filter((c) => c.distance <= tolerance)
      .sort((a, b) => a.distance - b.distance)
      .map((c) => c.party);

    const chosen = [head];
    let total = head.members.length;
    for (const party of candidates) {
      if (total === needed) break;
      if (total + party.members.length > needed) continue;
      chosen.push(party);
      total += party.members.length;
    }
    if (total !== needed) return;

    for (const p of chosen) leaveQueue(p, "matched");
    startMatch(mode, chosen, []);
    syncQueue(mode);
  }

  /** Bots exist so one person can still play. They accept instantly and ban randomly. */
  function fillWithBots(party) {
    if (!party?.queuedAt) return;
    const cfg = MODES[party.mode];
    const needed = cfg.teamSize * 2;
    const humans = party.members.length;
    const pool = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    const bots = pool.slice(0, needed - humans).map((name) => ({
      steamId: uid("bot"),
      name,
      bot: true,
      accepted: true,
    }));
    leaveQueue(party, "bots");
    startMatch(party.mode, [party], bots);
    syncQueue(party.mode);
  }

  function startMatch(mode, partiesIn, bots) {
    const cfg = MODES[mode];
    const id = uid("m");

    // Parties are placed whole — splitting a duo across both teams is the one
    // thing a party is for.
    const teams = [
      { name: "Team A", players: [], side: null },
      { name: "Team B", players: [], side: null },
    ];
    const sorted = [...partiesIn].sort((a, b) => b.members.length - a.members.length);
    // Only parties of two or more get a premade marker. A solo queuer is not
    // "premade group 3 of 3"; they are on their own, and the roster should say
    // so by saying nothing.
    let premadeIndex = 0;
    for (const party of sorted) {
      const marker = party.members.length > 1 ? ++premadeIndex : null;
      const target = teams[0].players.length <= teams[1].players.length ? teams[0] : teams[1];
      for (const m of party.members) {
        target.players.push({
          steamId: m.steamId,
          name: m.name,
          accepted: false,
          leader: m.steamId === party.leader,
          elo: m.elo ?? STARTING_ELO,
          matches: m.matches ?? 0,
          premade: marker,
        });
      }
    }
    for (const bot of bots) {
      const target = teams[0].players.length <= teams[1].players.length ? teams[0] : teams[1];
      target.players.push(bot);
    }
    // Each team needs a captain to drive the veto; the party leader on that
    // team, else the first human, else the first bot.
    for (const t of teams) {
      if (!t.players.some((p) => p.leader && !p.bot)) {
        const human = t.players.find((p) => !p.bot);
        if (human) human.leader = true;
      }
    }

    const pool = MAP_POOLS[cfg.pool].slice();
    const match = {
      id,
      mode,
      phase: "found",
      teams,
      pool,
      remaining: pool.slice(),
      actions: [],
      // A coin flip, stated as one: whoever wins bans first, and the other
      // team picks sides at the end. Without it the first team listed always
      // had the advantage of the first ban.
      turn: Math.random() < 0.5 ? 0 : 1,
      stepIndex: 0,
      plan: vetoPlan(pool.length),
      turnDeadline: null,
      map: null,
      connect: null,
      chat: [],
      humanCount: teams.flatMap((t) => t.players).filter((p) => !p.bot).length,
      acceptedCount: 0,
      acceptDeadline: now() + ACCEPT_MS,
      partyIds: partiesIn.map((p) => p.id),
    };

    matches.set(id, match);
    for (const t of teams) for (const p of t.players) if (!p.bot) matchOf.set(p.steamId, id);

    matchTimers.set(
      id,
      setTimeout(() => expireAccept(id), ACCEPT_MS)
    );
    syncMatch(match);
  }

  /**
   * Ban until one map is left, then the team that did not ban last picks a side.
   *
   * Seven maps means six bans, alternating. It is the format everyone already
   * knows from Faceit, and for a pool this size it is also simply the only one
   * that ends with a map nobody hated most.
   */
  function vetoPlan(poolSize) {
    const steps = [];
    for (let i = 0; i < poolSize - 1; i++) steps.push({ type: "ban" });
    steps.push({ type: "side" });
    return steps;
  }

  function expireAccept(matchId) {
    const match = matches.get(matchId);
    if (!match || match.phase !== "found") return;

    const declined = match.teams
      .flatMap((t) => t.players)
      .filter((p) => !p.bot && !p.accepted)
      .map((p) => p.steamId);

    abandonMatch(match, { requeue: true, blame: declined, reason: "timeout" });
  }

  /** Put everyone who did their part back in the queue; drop everyone who did not. */
  function abandonMatch(match, { requeue, blame, reason }) {
    clearTimeout(matchTimers.get(match.id));
    matchTimers.delete(match.id);
    matches.delete(match.id);

    const blamed = new Set(blame ?? []);
    const affected = [];

    for (const pid of match.partyIds) {
      const party = parties.get(pid);
      if (!party) continue;
      const guilty = party.members.some((m) => blamed.has(m.steamId));
      for (const m of party.members) matchOf.delete(m.steamId);
      affected.push(party);
      if (requeue && !guilty) {
        enqueue(party);
      } else {
        party.queueReason = guilty ? "declined" : reason ?? null;
      }
    }

    for (const t of match.teams) {
      for (const p of t.players) {
        if (p.bot) continue;
        matchOf.delete(p.steamId);
        emitTo(p.steamId, "rq:notice", {
          kind: blamed.has(p.steamId) ? "error" : "warn",
          code: blamed.has(p.steamId) ? "you_declined" : "match_cancelled",
        });
        emitTo(p.steamId, "rq:state", stateFor(p.steamId));
      }
    }
    for (const party of affected) syncParty(party);
  }

  function beginVeto(match) {
    clearTimeout(matchTimers.get(match.id));
    match.phase = "veto";
    armTurn(match);
    syncMatch(match);
  }

  /**
   * Start the clock on whoever's turn it is, and resolve it for them if that
   * team is bots.
   *
   * Shared by the first turn and every turn after it. When only `advance` did
   * this, a coin flip that gave the first ban to an all-bot team left the board
   * frozen for the full turn timer before anything happened — twenty-five
   * seconds of a veto screen that looks broken, on exactly half of all solo
   * matches.
   */
  function armTurn(match) {
    match.turnDeadline = now() + VETO_TURN_MS;
    clearTimeout(matchTimers.get(match.id));
    matchTimers.set(match.id, setTimeout(() => autoVeto(match.id), VETO_TURN_MS));

    // A beat, so the ban is watchable rather than instant.
    if (match.teams[match.turn].players.every((p) => p.bot)) {
      setTimeout(() => autoVeto(match.id), 1400);
    }
  }

  function autoVeto(matchId) {
    const match = matches.get(matchId);
    if (!match || match.phase !== "veto") return;
    const step = match.plan[match.stepIndex];
    if (!step) return;
    if (step.type === "side") {
      applySide(match, match.turn, Math.random() < 0.5 ? "CT" : "T", true);
    } else {
      const pick = match.remaining[Math.floor(Math.random() * match.remaining.length)];
      applyBan(match, match.turn, pick, true);
    }
  }

  function advance(match) {
    match.stepIndex += 1;
    const step = match.plan[match.stepIndex];
    if (!step) return finishVeto(match);

    match.turn = match.turn === 0 ? 1 : 0;
    armTurn(match);
    syncMatch(match);
  }

  function applyBan(match, teamIndex, map, auto) {
    if (!match.remaining.includes(map)) return;
    match.remaining = match.remaining.filter((m) => m !== map);
    match.actions.push({ type: "ban", team: teamIndex, map, auto: !!auto, at: now() });
    advance(match);
  }

  function applySide(match, teamIndex, side, auto) {
    const other = teamIndex === 0 ? 1 : 0;
    match.teams[teamIndex].side = side;
    match.teams[other].side = side === "CT" ? "T" : "CT";
    match.actions.push({ type: "side", team: teamIndex, side, auto: !!auto, at: now() });
    advance(match);
  }

  const net = require("net");
  function rconExec(command) {
    const host = process.env.RCON_HOST;
    const port = parseInt(process.env.RCON_PORT || "27015", 10);
    const password = process.env.RCON_PASSWORD;
    if (!host || !password) return Promise.resolve("");

    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port, timeout: 6000 });
      let buffer = Buffer.alloc(0);
      let authed = false;
      let response = "";
      const done = (err) => { socket.destroy(); if (err) reject(err); else resolve(response.trim()); };

      socket.on("timeout", () => done(new Error("RCON timeout")));
      socket.on("error", (e) => done(e));
      socket.on("connect", () => {
        const body = Buffer.from(password, "utf8");
        const b = Buffer.alloc(14 + body.length);
        b.writeInt32LE(10 + body.length, 0); b.writeInt32LE(1, 4); b.writeInt32LE(3, 8); body.copy(b, 12);
        socket.write(b);
      });

      socket.on("data", (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        while (buffer.length >= 4) {
          const size = buffer.readInt32LE(0);
          if (buffer.length < 4 + size) break;
          const id = buffer.readInt32LE(4);
          const type = buffer.readInt32LE(8);
          const str = buffer.toString("utf8", 12, buffer.length - 2);
          buffer = buffer.subarray(4 + size);

          if (id === -1) return done(new Error("RCON Auth Failed"));
          if (type === 2) authed = true;
          if (type === 0 && id === 2) response += str;

          if (authed && id === 1) {
            const body = Buffer.from(command, "utf8");
            const b = Buffer.alloc(14 + body.length);
            b.writeInt32LE(10 + body.length, 0); b.writeInt32LE(2, 4); b.writeInt32LE(2, 8); body.copy(b, 12);
            socket.write(b);
            
            // Empty command to signal end
            const e = Buffer.alloc(14);
            e.writeInt32LE(10, 0); e.writeInt32LE(3, 4); e.writeInt32LE(0, 8);
            socket.write(e);
          }
          if (type === 0 && id === 3) return done();
        }
      });
    });
  }

  function finishVeto(match) {
    clearTimeout(matchTimers.get(match.id));
    match.phase = "ready";
    match.map = match.remaining[0] ?? match.pool[0];
    match.connect = null; // Will be set once server is ready
    match.turnDeadline = null;
    matchTimers.set(
      match.id,
      setTimeout(() => {
        for (const t of match.teams) for (const p of t.players) if (!p.bot) matchOf.delete(p.steamId);
        matches.delete(match.id);
      }, READY_LINGER_MS)
    );
    syncMatch(match);
    
    // Configure server: change map and start competitive retakes
    rconExec(`map ${match.map}`).then(() => {
      setTimeout(() => rconExec("css_cr"), 5000);
      
      let attempts = 0;
      const poll = setInterval(() => {
        attempts++;
        if (attempts > 30) {
          clearInterval(poll);
          // Fallback just in case
          match.connect = "adrien.gamergod.net:26541";
          syncMatch(match);
          return;
        }
        
        rconExec("status").then(out => {
          // Verify map matches and possibly check game mode if status provides it
          // status output usually has: map     : de_mirage
          if (out.includes(`map     : ${match.map}`)) {
            match.connect = "adrien.gamergod.net:26541";
            syncMatch(match);
            clearInterval(poll);
          }
        }).catch(err => console.error("RCON status error", err));
      }, 3000);
    }).catch(console.error);
  }

  function enqueue(party) {
    const q = queues.get(party.mode);
    if (!q || q.includes(party.id)) return;
    party.queuedAt = now();
    party.queueReason = null;
    q.push(party.id);

    const t = setTimeout(() => fillWithBots(party), BOT_FILL_MS);
    botTimers.set(party.id, t);

    tryMatch(party.mode);
  }

  /** The captain speaks for their team; anyone else's veto click is ignored. */
  function captainTeam(match, steamId) {
    for (let i = 0; i < match.teams.length; i++) {
      const p = match.teams[i].players.find((x) => x.steamId === steamId);
      if (p) return p.leader ? i : -1;
    }
    return -1;
  }

  // ------------------------------------------------------------------ wiring

  io.on("connection", (socket) => {
    const me = () => socket.steamId && String(socket.steamId);

    const push = () => {
      const id = me();
      if (id) socket.emit("rq:state", stateFor(id));
    };

    socket.on("rq:hello", async (data) => {
      const id = me();
      if (!id) return socket.emit("rq:notice", { kind: "error", code: "not_signed_in" });
      const party = await ensureParty(id, data?.name, data?.lobbyId);
      // A name arriving later than the party (the profile fetch resolves after
      // the socket does) should still land on the member row.
      const mine = party.members.find((m) => m.steamId === id);
      if (mine && data?.name) mine.name = data.name;
      push();
      // Ratings arrive a moment later; the lobby renders without them rather
      // than waiting on a database round trip to show a party of one.
      refreshRatings(party).then(() => syncParty(party));
    });

    socket.on("rq:party:mode", ({ mode } = {}) => {
      const id = me();
      const party = partyFor(id);
      if (!party || party.leader !== id || !MODES[mode]) return;
      if (party.members.length > MODES[mode].teamSize) {
        return socket.emit("rq:notice", { kind: "error", code: "party_too_big" });
      }
      leaveQueue(party, "mode_changed");
      party.mode = mode;
      syncParty(party);
    });

    socket.on("rq:party:name", ({ name } = {}) => {
      const id = me();
      const party = partyFor(id);
      if (!party || party.leader !== id) return;
      party.name = typeof name === "string" ? name.trim().slice(0, 32) : null;
      if (party.name === "") party.name = null;
      syncParty(party);
    });

    socket.on("rq:party:invite", ({ steamId, name } = {}) => {
      const id = me();
      const party = partyFor(id);
      const target = String(steamId ?? "");
      if (!party || !target) return;
      if (party.leader !== id) return socket.emit("rq:notice", { kind: "error", code: "not_leader" });
      if (party.members.length >= partyCapacity(party)) {
        return socket.emit("rq:notice", { kind: "error", code: "party_full" });
      }
      if (partyOf.get(target) === party.id) return;
      if (!socketFor(target)) return socket.emit("rq:notice", { kind: "error", code: "friend_offline" });

      const inviterName = party.members.find((m) => m.steamId === id)?.name ?? null;
      invites.set(target, { partyId: party.id, from: id, fromName: inviterName, at: now() });
      emitTo(target, "rq:state", stateFor(target));
      emitTo(target, "rq:notice", { kind: "invite", code: "invited", from: id, fromName: inviterName });
      socket.emit("rq:notice", { kind: "ok", code: "invite_sent", to: target, toName: name ?? null });
    });

    socket.on("rq:party:accept", () => {
      const id = me();
      const invite = invites.get(id);
      if (!invite) return;
      invites.delete(id);
      const party = parties.get(invite.partyId);
      if (!party) return socket.emit("rq:notice", { kind: "error", code: "party_gone" });
      if (party.members.length >= partyCapacity(party)) {
        return socket.emit("rq:notice", { kind: "error", code: "party_full" });
      }

      // Leaving your own party to join another must not strand anyone left in it.
      const old = partyFor(id);
      if (old && old.id !== party.id) removeMember(old, id);

      const name = old?.members.find((m) => m.steamId === id)?.name ?? null;
      party.members.push({ steamId: id, name, ready: true });
      partyOf.set(id, party.id);
      leaveQueue(party, "party_changed");
      syncParty(party);
    });

    socket.on("rq:party:decline", () => {
      const id = me();
      const invite = invites.get(id);
      invites.delete(id);
      if (invite) emitTo(invite.from, "rq:notice", { kind: "warn", code: "invite_declined", by: id });
      push();
    });

    socket.on("rq:party:kick", ({ steamId } = {}) => {
      const id = me();
      const party = partyFor(id);
      if (!party || party.leader !== id || String(steamId) === id) return;
      removeMember(party, String(steamId));
      emitTo(String(steamId), "rq:notice", { kind: "warn", code: "kicked" });
      emitTo(String(steamId), "rq:state", stateFor(String(steamId)));
      syncParty(party);
    });

    socket.on("rq:party:leave", () => {
      const id = me();
      const party = partyFor(id);
      if (!party) return;
      removeMember(party, id);
      syncParty(party);
      ensureParty(id);
      push();
    });

    socket.on("rq:queue:join", ({ mode } = {}) => {
      const id = me();
      const party = partyFor(id);
      if (!party) return;
      if (party.leader !== id) return socket.emit("rq:notice", { kind: "error", code: "not_leader" });
      if (matchOf.get(id)) return;
      if (mode && MODES[mode]) party.mode = mode;

      // Queue first, then re-read the ratings. Waiting on the database before
      // joining meant the button did nothing until a round trip came back,
      // which on a cold connection is a second of a screen that looks broken.
      // The rating still gets refreshed — matching just re-runs once it lands,
      // and a stale rating for that moment costs nothing because nothing has
      // been matched yet.
      enqueue(party);
      syncParty(party);

      refreshRatings(party).then(() => {
        if (!party.queuedAt) return;
        syncParty(party);
        tryMatch(party.mode);
      });
    });

    socket.on("rq:queue:leave", () => {
      const id = me();
      const party = partyFor(id);
      if (!party || party.leader !== id) return;
      leaveQueue(party, "cancelled");
      syncParty(party);
    });

    socket.on("rq:match:accept", () => {
      const id = me();
      const match = matches.get(matchOf.get(id));
      if (!match || match.phase !== "found") return;
      const p = match.teams.flatMap((t) => t.players).find((x) => x.steamId === id);
      if (!p || p.accepted) return;
      p.accepted = true;
      match.acceptedCount += 1;
      if (match.acceptedCount >= match.humanCount) beginVeto(match);
      else syncMatch(match);
    });

    socket.on("rq:match:decline", () => {
      const id = me();
      const match = matches.get(matchOf.get(id));
      if (!match || match.phase !== "found") return;
      abandonMatch(match, { requeue: true, blame: [id], reason: "declined" });
    });

    socket.on("rq:veto:ban", ({ map } = {}) => {
      const id = me();
      const match = matches.get(matchOf.get(id));
      if (!match || match.phase !== "veto") return;
      if (match.plan[match.stepIndex]?.type !== "ban") return;
      if (captainTeam(match, id) !== match.turn) {
        return socket.emit("rq:notice", { kind: "error", code: "not_your_turn" });
      }
      applyBan(match, match.turn, String(map), false);
    });

    socket.on("rq:veto:side", ({ side } = {}) => {
      const id = me();
      const match = matches.get(matchOf.get(id));
      if (!match || match.phase !== "veto") return;
      if (match.plan[match.stepIndex]?.type !== "side") return;
      if (captainTeam(match, id) !== match.turn) {
        return socket.emit("rq:notice", { kind: "error", code: "not_your_turn" });
      }
      applySide(match, match.turn, side === "T" ? "T" : "CT", false);
    });

    socket.on("rq:chat", ({ text } = {}) => {
      const id = me();
      const match = matches.get(matchOf.get(id));
      const body = String(text ?? "").slice(0, 240).trim();
      if (!match || !body) return;
      const from = match.teams.flatMap((t) => t.players).find((p) => p.steamId === id);
      match.chat.push({ from: id, name: from?.name ?? null, text: body, at: now() });
      syncMatch(match);
    });

    socket.on("disconnect", () => {
      const id = me();
      if (!id) return;
      invites.delete(id);
      const party = partyFor(id);
      if (!party) return;

      // A disconnect during a live match is not a reason to dissolve it — the
      // page may just be reloading, and the veto belongs to the team.
      if (matchOf.get(id)) return;
      removeMember(party, id);
      syncParty(party);
    });
  });

  function removeMember(party, steamId) {
    party.members = party.members.filter((m) => m.steamId !== steamId);
    partyOf.delete(steamId);
    leaveQueue(party, "party_changed");
    if (party.members.length === 0) {
      disbandParty(party);
      return;
    }
    if (party.leader === steamId) party.leader = party.members[0].steamId;
  }

  return {
    stats: () => ({
      parties: parties.size,
      queued: Object.fromEntries(Object.keys(MODES).map((m) => [m, queuedPlayerCount(m)])),
      matches: matches.size,
    }),
  };
}

module.exports = { attachRetakesMatchmaking, MODES, MAP_POOLS };
