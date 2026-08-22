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
 * Bots fill empty slots in the training queue after a grace period rather than
 * never, and in that queue only. A competitive queue that quietly hands you
 * four robots is not a competitive queue, and the rating attached to it stops
 * meaning anything the first time it happens.
 */

/** How long the training queue waits for humans before bots are offered. */
const BOT_FILL_MS = 15_000;

/**
 * A queue is a size and two switches, not a name.
 *
 * It used to be three hard-coded queues — `bots`, `classic`, `premium` — where
 * `bots` was 2v2 and the other two were 3v3, so "how many of us" and "who am I
 * matched against" were the same choice and you could not have one without the
 * other. Wanting a 2v2 premium game meant wanting a queue that did not exist.
 *
 * So the three became a size (`duo`/`trio`) and two modifiers:
 *
 *   testing — bots fill every slot nobody human took. The only way bots ever
 *             enter a match, and it is a decision rather than a timeout.
 *   premium — a tighter rating band. Entitlement-gated: see isPremium().
 *
 * Testing ignores premium rather than multiplying with it. A queue that fills
 * itself with robots after fifteen seconds has no rating band worth tightening,
 * and carrying the flag anyway would split a queue that is already one party.
 *
 * `band` is how far apart two parties may be rated, widening the longer the
 * party at the head of the queue has waited: `base` points at zero seconds,
 * plus `widen` per second, and never more than `base + max` in total. That band
 * is the only thing premium changes, and it is meant to be tuned here.
 */
const SIZES = {
  duo: { id: "duo", teamSize: 2 },
  trio: { id: "trio", teamSize: 3 },
};

const BANDS = {
  classic: { base: 100, widen: 12, max: 900 },
  premium: { base: 50, widen: 5, max: 300 },
  testing: { base: 400, widen: 40, max: 1600 },
};

/** The key a party's queue is stored and looked up under. */
const queueKey = (size, premium, testing) =>
  testing ? `${size}:test` : `${size}:${premium ? "premium" : "classic"}`;

function buildQueues() {
  const out = {};
  for (const size of Object.values(SIZES)) {
    for (const [premium, testing] of [[false, false], [true, false], [false, true]]) {
      const id = queueKey(size.id, premium, testing);
      out[id] = {
        id,
        size: size.id,
        teamSize: size.teamSize,
        premium,
        testing,
        pool: "retakes",
        /** Only a testing queue may invent players. */
        bots: testing,
        botFillMs: testing ? BOT_FILL_MS : null,
        band: BANDS[testing ? "testing" : premium ? "premium" : "classic"],
        label: testing
          ? `Testing ${size.teamSize}v${size.teamSize}`
          : `${size.teamSize}v${size.teamSize}${premium ? " Premium" : ""}`,
      };
    }
  }
  return out;
}

const QUEUES = buildQueues();

/**
 * Team sizes have to be ones the game server will accept.
 *
 * The plugin validates the roster against `Competitive.AllowedTeamSizes` in
 * rankings.json — [2, 3] as shipped — and refuses anything else, so a queue
 * that formed 5v5 here would build a lobby, run a veto, change the map and then
 * be turned away at the last command with "team size 5 is not allowed". Which
 * is also the right answer: this is a retakes server, the map configs hold
 * retake spawns per bombsite, and five a side is not a retake.
 *
 * Raising it is a two-sided change: this list and AllowedTeamSizes both, plus
 * enough spawns in the map configs to stand everyone up.
 */
const SERVER_ALLOWED_TEAM_SIZES = [2, 3];

for (const q of Object.values(QUEUES)) {
  if (!SERVER_ALLOWED_TEAM_SIZES.includes(q.teamSize)) {
    throw new Error(
      `queue "${q.id}" is ${q.teamSize}v${q.teamSize}, which the game server will refuse ` +
      `(allowed: ${SERVER_ALLOWED_TEAM_SIZES.join(", ")})`
    );
  }
}

/** What a party is set to before anyone chooses. */
const DEFAULT_SIZE = "trio";
const DEFAULT_QUEUE = queueKey(DEFAULT_SIZE, false, false);

const isQueueId = (id) => typeof id === "string" && Object.hasOwn(QUEUES, id);

/**
 * Queue names written into RetakesLobbies.Mode before this file had queues.
 *
 * Rows outlive schemes. `ensureParty` already fell back to the default for
 * anything it did not recognise, which is safe but silently drops a party into
 * 3v3 when the link they followed said 2v2 — so the ones with an obvious
 * successor get it, and only the genuinely unknown fall back.
 */
const LEGACY_QUEUES = {
  "2v2": queueKey("duo", false, false),
  "3v3": queueKey("trio", false, false),
  bots: queueKey("duo", false, true),
  classic: queueKey("trio", false, false),
  premium: queueKey("trio", true, false),
};

const resolveQueueId = (mode) =>
  isQueueId(mode) ? mode : (LEGACY_QUEUES[mode] ?? DEFAULT_QUEUE);

/**
 * Where the finished match tells people to connect.
 *
 * One place, one environment variable. It was written out twice inside the
 * ready handler, which is exactly the kind of string that gets changed in one
 * of its two homes.
 */
const CONNECT_ADDRESS = process.env.RETAKES_CONNECT_ADDRESS || "adrien.gamergod.net:26541";

// Active duty plus Overpass, Train and Vertigo — the ten maps the site has
// calibrated radars and art for, which is the same list. Adding one here means
// adding a screenshot too; see tools/map-screenshots.
const MAP_POOLS = {
  retakes: [
    "de_ancient", "de_anubis", "de_cache", "de_dust2", "de_inferno",
    "de_mirage", "de_nuke", "de_overpass", "de_train", "de_vertigo",
  ],
};

/**
 * A stored exclusion list, made safe to use.
 *
 * Trimmed rather than trusted: the row outlives the pool it was written
 * against, so a player who dropped four maps that have since left the rotation
 * must not end up excluding nothing, and one written when the cap was higher
 * must not empty the pool. Order is the pool's, so two lists compare and
 * display the same way whatever order they were clicked in.
 */
function sanitiseExcluded(input, pool) {
  const raw = Array.isArray(input) ? input : [];
  const wanted = new Set(raw.filter((m) => typeof m === "string"));
  return pool.filter((m) => wanted.has(m)).slice(0, MAX_EXCLUDED_MAPS);
}

/** What one party will play, in pool order. */
const allowedMaps = (pool, excluded) => pool.filter((m) => !excluded.includes(m));

const BOT_NAMES = [
  "f0rest", "GeT_RiGhT", "s1mple", "dev1ce", "ZywOo", "NiKo", "kennyS",
  "coldzera", "olofmeister", "dupreeh", "electronic", "sh1ro", "m0NESY",
];

/**
 * Whether an account may turn Premium on.
 *
 * True for everyone today, deliberately and temporarily: the tighter band is
 * built and the button is real, and the subscription that gates it is not. This
 * is the one place that changes when it is — so the gate exists from the start
 * and nothing else has to learn about it later.
 *
 * Mirrors isPremium() in lib/premium.ts. A copy rather than an import for the
 * same reason effectiveElo below is one: this file is CommonJS on the socket
 * server and that one is TypeScript in the Next build.
 */
// eslint-disable-next-line no-unused-vars
const isPremium = (_steamId) => true;

/**
 * Map preferences, and what they cost.
 *
 * A captain may drop up to four of the ten. Both captains' drops are honoured —
 * a map either of them refused is not in the veto — which with two captains at
 * four each could leave two maps out of ten, and two maps is not a veto.
 *
 * So the preference is a *matchmaking* constraint rather than a filter applied
 * after the fact: two parties are only paired when what they both allow is
 * still big enough to run a veto on. That floor relaxes the longer the party at
 * the head of the queue has waited, exactly as the rating band does, so a
 * fussy captain waits longer instead of never matching.
 */
const MAX_EXCLUDED_MAPS = 4;
const VETO_POOL_FLOOR = 5;
const VETO_POOL_FLOOR_MIN = 3;
const VETO_POOL_RELAX_MS = 30_000;

/** How many maps a lobby must share, given how long the head of the queue has waited. */
const requiredPoolSize = (msWaiting) =>
  Math.max(VETO_POOL_FLOOR_MIN, VETO_POOL_FLOOR - Math.floor(Math.max(0, msWaiting) / VETO_POOL_RELAX_MS));

/** How long everyone has to accept a found match. */
const ACCEPT_MS = 20_000;
/** How long one veto turn lasts before it is taken automatically. */
const VETO_TURN_MS = 25_000;
/** How long a completed match stays on screen before the lobby resets. */
const READY_LINGER_MS = 15 * 60_000;

/**
 * Chat lines kept per match, and how fast one person may add to them.
 *
 * The log used to grow without a bound and be re-sent in full on every state
 * push — which, since a chat message *is* a state push, made a long lobby send
 * a linearly growing payload to everyone on every line typed. Keeping a window
 * costs nothing: the client only ever draws the tail.
 */
const CHAT_HISTORY = 60;
const CHAT_MAX_LENGTH = 240;
const CHAT_MIN_GAP_MS = 500;
const CHAT_BURST = 5;
const CHAT_BURST_WINDOW_MS = 4_000;

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
const acceptableGap = (cfg, secondsWaiting) =>
  cfg.band.base + Math.min(cfg.band.max, Math.max(0, secondsWaiting) * cfg.band.widen);

/** How often the map-load gate re-reads `status`, and for how long it keeps trying. */
const STATUS_POLL_MS = 3_000;
const STATUS_POLL_LIMIT = 30;

const now = () => Date.now();
const uid = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

function attachRetakesMatchmaking(
  io,
  { connectedUsers, loadRatings, loadMapPrefs, saveMapPrefs, loadSetupState, prisma }
) {
  /** partyId -> party */
  const parties = new Map();
  /** steamId -> partyId */
  const partyOf = new Map();
  /** steamId -> { partyId, from, at } */
  const invites = new Map();
  /** queue id -> [partyId] in join order */
  const queues = new Map(Object.keys(QUEUES).map((q) => [q, []]));
  /** matchId -> match */
  const matches = new Map();
  /** steamId -> matchId */
  const matchOf = new Map();
  /** partyId -> timeout */
  const botTimers = new Map();
  /** matchId -> timeout */
  const matchTimers = new Map();

  /**
   * The last live state the game server pushed, and when.
   *
   * The server also writes this into WebLiveMatches every three seconds, and
   * /api/match/live reads that row — so this is a latency improvement rather
   * than a source of truth. Held in memory on purpose: it is worth nothing the
   * moment the process restarts, which is exactly when the row is worth
   * something.
   */
  let liveState = null;

  // ------------------------------------------------------------------ helpers

  const socketFor = (steamId) => connectedUsers.get(String(steamId));

  /** steamId -> timestamps of that player's recent chat lines. */
  const chatHistory = new Map();

  /**
   * One line at a time, and no more than a short burst.
   *
   * A chat message triggers a full state push to every player in the match, so
   * a loop typing into this event is a broadcast amplifier. The limit is loose
   * enough that nobody typing normally will ever see it.
   */
  function allowChat(steamId) {
    const at = now();
    const recent = (chatHistory.get(steamId) ?? []).filter((t) => at - t < CHAT_BURST_WINDOW_MS);
    if (recent.length > 0 && at - recent[recent.length - 1] < CHAT_MIN_GAP_MS) return false;
    if (recent.length >= CHAT_BURST) return false;
    recent.push(at);
    chatHistory.set(steamId, recent);
    return true;
  }

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
      name: null,
      members: [{ steamId: String(steamId), name: name ?? null, ready: true, elo: STARTING_ELO, matches: 0 }],
      queue: DEFAULT_QUEUE,
      queuedAt: null,
      createdAt: now(),
    };
    parties.set(id, party);
    partyOf.set(String(steamId), id);
    if (prisma) {
      await prisma.retakesLobby.upsert({
        where: { Id: id },
        create: { Id: id, LeaderId: BigInt(steamId), Mode: DEFAULT_QUEUE },
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
            name: null,
            members: [{ steamId: String(steamId), name: name ?? null, ready: true, elo: STARTING_ELO, matches: 0 }],
            // Rows outlive naming schemes — `2v2`, `bots`, `classic` were all
            // written into this column at some point. The ones with an obvious
            // successor get it; see LEGACY_QUEUES.
            queue: resolveQueueId(dbLobby.Mode),
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

  /** The configuration of the queue a party is set to. */
  const queueOf = (party) => QUEUES[party?.queue] ?? QUEUES[DEFAULT_QUEUE];

  /** A party can never hold more people than a whole team. */
  const partyCapacity = (party) => queueOf(party).teamSize;

  /** The pool the party's queue draws from. */
  const poolOf = (party) => MAP_POOLS[queueOf(party).pool];

  /**
   * The captain's saved map preference, pulled in once so the lobby opens
   * already showing it. Never fatal: a party whose preference could not be read
   * excludes nothing, which is the same position as a player who has set none.
   */
  async function refreshMapPrefs(party) {
    if (typeof loadMapPrefs !== "function" || !party) return;
    // Only the captain's, because only the captain's counts — a member's
    // preference applies in whatever lobby they are the captain of.
    if (party.mapsTouched) return;
    try {
      const rows = await loadMapPrefs([party.leader]);
      party.excludedMaps = sanitiseExcluded(rows?.[party.leader], poolOf(party));
    } catch {
      // Left as it was.
    }
  }

  /** What the lobby draws: the whole pool, and which of it the captain dropped. */
  function mapStateFor(party) {
    const pool = poolOf(party);
    const excluded = sanitiseExcluded(party.excludedMaps ?? [], pool);
    return {
      pool,
      excluded,
      max: MAX_EXCLUDED_MAPS,
      /** True once someone changed it in this lobby, so Save can offer itself. */
      touched: Boolean(party.mapsTouched),
    };
  }

  /** Maps every one of these parties is willing to play, in pool order. */
  function sharedMaps(parties_, pool) {
    return pool.filter((map) =>
      parties_.every((p) => !sanitiseExcluded(p.excludedMaps ?? [], pool).includes(map))
    );
  }

  /**
   * Who in this party has not been through the loadout picker.
   *
   * Fails open. If the lookup is not wired or the database is unreachable, a
   * party that cannot be checked queues — an outage should not lock everyone
   * out of the game, and the server has defaults for every round type.
   */
  async function membersWithoutLoadout(party) {
    if (typeof loadSetupState !== "function" || !party) return [];
    try {
      const ids = party.members.map((m) => m.steamId);
      const rows = await loadSetupState(ids);
      return ids.filter((sid) => rows?.[sid] !== true);
    } catch {
      return [];
    }
  }

  function leaveQueue(party, reason) {
    if (!party?.queuedAt) return;
    const q = queues.get(party.queue);
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

    const cfg = party ? queueOf(party) : null;

    return {
      // The three buttons and the toggle, as state rather than as a list of
      // queue names: the client renders Testing / 2VS / 3VS and a Premium
      // toggle, and never has to know that those compose into a queue key.
      modes: {
        sizes: Object.values(SIZES).map((s) => ({ id: s.id, teamSize: s.teamSize })),
        size: cfg?.size ?? DEFAULT_SIZE,
        premium: cfg?.premium ?? false,
        testing: cfg?.testing ?? false,
        /** Everyone, for now — see isPremium. */
        premiumAvailable: isPremium(id),
        /** Bots fill the empty slots, so a testing queue never waits on people. */
        botFillMs: BOT_FILL_MS,
      },
      party: party && {
        id: party.id,
        leader: party.leader,
        isLeader: party.leader === id,
        name: party.name,
        queue: party.queue,
        capacity: partyCapacity(party),
        members: party.members,
        elo: partyElo(party),
        queuedAt: party.queuedAt,
        queueReason: party.queueReason ?? null,
        safeQueue: Boolean(party.safeQueue),
        /** Pre-filled from the captain's saved preference; see mapStateFor. */
        maps: mapStateFor(party),
      },
      invite: invite && { partyId: invite.partyId, from: invite.from, fromName: invite.fromName, at: invite.at },
      // What the search is doing right now. Separate from `party.queue`, which
      // is only which queue the party is set to — you can be set to premium and
      // not be searching.
      search: party?.queuedAt
        ? {
            queue: party.queue,
            label: cfg.label,
            since: party.queuedAt,
            searching: queuedPlayerCount(party.queue),
            // What a full lobby costs, so a queue that is waiting can say what
            // it is waiting for instead of spinning.
            needed: cfg.teamSize * 2,
            bots: cfg.bots,
            botFillAt: cfg.bots && cfg.botFillMs ? party.queuedAt + cfg.botFillMs : null,
          }
        : null,
      match: match ? publicMatch(match, id) : null,
      online: connectedUsers.size,
    };
  }

  function queuedPlayerCount(queueId) {
    const q = queues.get(queueId) ?? [];
    return q.reduce((n, pid) => n + (parties.get(pid)?.members.length ?? 0), 0);
  }

  function publicMatch(match, viewerId) {
    const mine = match.teams.findIndex((t) => t.players.some((p) => p.steamId === viewerId));
    return {
      id: match.id,
      queue: match.queue,
      queueLabel: QUEUES[match.queue]?.label ?? match.queue,
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
      // `connect` stays null until the game server has confirmed it is on the
      // right map and taken the roster. `server` is what the lobby shows in the
      // meantime — including when it never gets there, which is a thing the
      // screen has to be able to say.
      result: match.phase === "ready"
        ? {
            map: match.map,
            connect: match.connect,
            sides: match.teams.map((t) => t.side),
            server: { state: match.server.state, step: match.server.step, error: match.server.error },
          }
        : null,
      // Team chat is filtered here, not in the browser.
      //
      // It used to be sent whole and hidden with a client-side filter, which is
      // not hiding it: the other team's calls were sitting in every viewer's
      // socket payload, one devtools panel away. A team channel that leaks is
      // worse than no team channel, because people trust it.
      chat: match.chat
        .filter((c) => c.team == null || c.team === mine)
        .slice(-CHAT_HISTORY),
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

  function syncQueue(queueId) {
    for (const pid of queues.get(queueId) ?? []) syncParty(parties.get(pid));
  }

  // -------------------------------------------------------------- match-making

  function tryMatch(queueId) {
    const cfg = QUEUES[queueId];
    const q = queues.get(queueId);
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

    const waitedMs = now() - (head.queuedAt ?? now());
    const waited = waitedMs / 1000;
    const tolerance = acceptableGap(cfg, waited);
    const anchor = partyElo(head);
    const pool = MAP_POOLS[cfg.pool];
    // How many maps this lobby has to end up sharing. Relaxes with the wait,
    // like the rating band, so two fussy captains eventually meet.
    const minPool = requiredPoolSize(waitedMs);

    const candidates = q
      .map((pid) => parties.get(pid))
      .filter((party) => party && party.id !== head.id)
      .map((party) => ({ party, distance: Math.abs(partyElo(party) - anchor) }))
      .filter((c) => c.distance <= tolerance)
      // Safe queue is opt-in on both sides or neither. It does not widen with
      // the wait: the point of asking for it is that it is not traded away.
      .filter((c) => Boolean(c.party.safeQueue) === Boolean(head.safeQueue))
      // A party whose captain has dropped maps this one needs is not a
      // candidate, however close their rating. Checked pairwise against the
      // head first as a cheap filter; the whole set is checked again below,
      // because three parties can each agree with the head and not with
      // each other.
      .filter((c) => sharedMaps([head, c.party], pool).length >= minPool)
      .sort((a, b) => a.distance - b.distance)
      .map((c) => c.party);

    const chosen = [head];
    let total = head.members.length;
    for (const party of candidates) {
      if (total === needed) break;
      if (total + party.members.length > needed) continue;
      if (sharedMaps([...chosen, party], pool).length < minPool) continue;
      chosen.push(party);
      total += party.members.length;
    }
    if (total !== needed) return;

    for (const p of chosen) leaveQueue(p, "matched");
    startMatch(queueId, chosen, [], sharedMaps(chosen, pool));
    syncQueue(queueId);
  }

  /**
   * Bots exist so one person can still walk the flow. They accept instantly and
   * ban randomly.
   *
   * The guard is the point: this is reachable from a timer, and a timer that
   * fires against a competitive queue would quietly turn it into training. Only
   * the queue that says it may have bots gets them, and it says so in one place.
   */
  function fillWithBots(party) {
    if (!party?.queuedAt) return;
    const cfg = queueOf(party);
    if (!cfg.bots) return;
    const needed = cfg.teamSize * 2;
    const humans = party.members.length;
    const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    const bots = names.slice(0, needed - humans).map((name) => ({
      steamId: uid("bot"),
      name,
      bot: true,
      accepted: true,
    }));
    leaveQueue(party, "bots");
    // One party, so its own preference is the whole constraint — and it is
    // honoured here as it would be in a real lobby, rather than the testing
    // queue being the one place a dropped map can still come up.
    startMatch(party.queue, [party], bots, sharedMaps([party], MAP_POOLS[cfg.pool]));
    syncQueue(party.queue);
  }

  function startMatch(queueId, partiesIn, bots, mapPool) {
    const cfg = QUEUES[queueId];
    const id = uid("m");

    // Parties are placed whole — splitting a duo across both teams is the one
    // thing a party is for.
    const teams = [
      { name: "Team A", players: [], side: null, sources: [] },
      { name: "Team B", players: [], side: null, sources: [] },
    ];
    const sorted = [...partiesIn].sort((a, b) => b.members.length - a.members.length);
    // Only parties of two or more get a premade marker. A solo queuer is not
    // "premade group 3 of 3"; they are on their own, and the roster should say
    // so by saying nothing.
    let premadeIndex = 0;
    for (const party of sorted) {
      const marker = party.members.length > 1 ? ++premadeIndex : null;
      const target = teams[0].players.length <= teams[1].players.length ? teams[0] : teams[1];
      target.sources.push(party);
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

    // A team that is one named party keeps its name — it is the name that team
    // already answers to, and it is what the game server is told the side is
    // called. Anything else stays Team A / Team B, because a lobby stitched out
    // of three solo queuers does not have a name yet.
    for (const t of teams) {
      const named = t.sources.length === 1 ? t.sources[0].name : null;
      if (named) t.name = named;
      delete t.sources;
    }
    if (teams[0].name === teams[1].name) teams[1].name = `${teams[1].name} 2`;

    // What both captains left standing. Falls back to the whole pool only if a
    // caller passed nothing — never to an empty veto, which would leave the
    // match with no map to land on.
    const pool = (mapPool?.length ? mapPool : MAP_POOLS[cfg.pool]).slice();
    const match = {
      id,
      queue: queueId,
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
      /** How the hand-off to the game server is going: idle → starting → ready | failed. */
      server: { state: "idle", step: null, error: null },
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
    // An unset password used to resolve as an empty string, which reads to every
    // caller as "it ran and said nothing". It did not run, and a start sequence
    // that believes it did is exactly how a lobby gets a connect string for a
    // server nobody ever spoke to.
    if (!host || !password) {
      return Promise.reject(new Error("RCON is not configured (RCON_HOST / RCON_PASSWORD)"));
    }

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
          // 4 + size - 2, not buffer.length - 2: `size` bounds *this* packet,
          // and two RCON packets routinely arrive in one TCP chunk — a reply
          // and the terminator that follows it always do. Reading to the end of
          // the buffer swallowed every following packet's raw header bytes into
          // this one's text, so `status` came back as the map list with binary
          // spliced through it. lib/rcon.ts, the same client one file over, has
          // always sliced this correctly.
          const str = buffer.subarray(12, 4 + size - 2).toString("utf8");
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

  /**
   * One RCON command, said out loud.
   *
   * Every step of the hand-off is logged with what was sent and what came back.
   * The other half of this conversation is a plugin on another machine, so this
   * log is the only place a start that did not happen can be read from.
   */
  async function rconStep(matchId, command) {
    console.log(`[retakes ${matchId}] rcon > ${command}`);
    try {
      const out = await rconExec(command);
      const line = String(out ?? "").replace(/\s+/g, " ").trim();
      if (line) console.log(`[retakes ${matchId}] rcon < ${line.slice(0, 300)}`);
      return out;
    } catch (err) {
      console.error(`[retakes ${matchId}] rcon ! ${command} — ${err?.message ?? err}`);
      throw err;
    }
  }

  /**
   * A team name the plugin can read as a single argument.
   *
   * `css_cr_team 0 <slug> <ids…>` is positional, so a name with a space in it
   * would be taken as a name followed by a SteamID that is not one.
   */
  function teamSlug(name, fallback) {
    const slug = String(name ?? "")
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24);
    return slug || fallback;
  }

  /** Real SteamID64s only — a bot's `bot_8f2k1x9c` is not one and is never sent. */
  const rosterIds = (team) =>
    team.players
      .filter((p) => !p.bot && /^\d{5,20}$/.test(String(p.steamId)))
      .map((p) => String(p.steamId));

  /**
   * The map `status` says is loaded, or null when it does not say.
   *
   * Read with a regex rather than by matching `map     : ` literally: the
   * column width is the server's to change, and a workshop map answers with a
   * path rather than a bare name.
   */
  function loadedMap(statusOutput) {
    const m = /^\s*map\s*[:=]\s*(\S+)/im.exec(String(statusOutput ?? ""));
    return m ? m[1].split("/").pop().trim() : null;
  }

  /**
   * Resolve once the server reports it is on `match.map`; reject if it never does.
   *
   * This is the gate, not a progress bar running beside one. The roster only
   * means anything to a server that has finished loading the level it will be
   * played on — sent during the change, it is sent into a level about to be
   * torn down.
   */
  function waitForMap(match) {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const tick = async () => {
        if (!matches.has(match.id)) return reject(new Error("match ended before the server was ready"));
        attempts += 1;
        let reported = null;
        try {
          reported = loadedMap(await rconExec("status"));
        } catch (err) {
          // A server mid-change refuses connections. That is the ordinary shape
          // of "not yet", and only matters if it is still true at the deadline.
          console.log(
            `[retakes ${match.id}] status ${attempts}/${STATUS_POLL_LIMIT} — ${err?.message ?? err}`
          );
        }
        if (reported === match.map) {
          console.log(`[retakes ${match.id}] ${match.map} loaded after ${attempts} polls`);
          return resolve();
        }
        if (attempts >= STATUS_POLL_LIMIT) {
          return reject(
            new Error(`server never reported ${match.map} (last seen: ${reported ?? "unknown"})`)
          );
        }
        setTimeout(tick, STATUS_POLL_MS);
      };
      setTimeout(tick, STATUS_POLL_MS);
    });
  }

  /** A short, safe reason the lobby can be shown and a bug report can quote. */
  function failureCode(err) {
    const message = String(err?.message ?? err ?? "");
    if (message.includes("not configured")) return "rcon_unconfigured";
    if (message.includes("never reported")) return "map_timeout";
    if (message.includes("match ended")) return "abandoned";
    // The server was reachable and on the right map; it read the roster and
    // said no. That is a different bug from a network one, and worth its own
    // code so the log points at the plugin rather than at the connection.
    if (message.includes("plugin refused")) return "plugin_refused";
    return "rcon_error";
  }

  /**
   * Hand the finished veto to the game server.
   *
   * The sequence is the plugin's, and it is roster-driven: reset, both rosters
   * by SteamID64, the side team 0 won in the veto, then go. The single `css_cr`
   * this replaced returns immediately when it is called from a console instead
   * of by a player, which is why a match has never actually started.
   */
  async function startServer(match) {
    let step = "map";
    const setStep = (next) => {
      step = next;
      match.server = { state: "starting", step: next, error: null };
      syncMatch(match);
    };

    try {
      setStep("map");
      await rconStep(match.id, `map ${match.map}`);

      setStep("loading");
      await waitForMap(match);

      const rosters = match.teams.map(rosterIds);
      const botCounts = match.teams.map((t) => t.players.filter((p) => p.bot).length);

      // This used to stop here.
      //
      // A side filled with bots has no SteamID64 to put on a roster, so there
      // was nothing to build a competitive match out of, and rather than have
      // the plugin refuse quietly this handed out the map and the address and
      // called it done. Which meant the one queue a person could try alone was
      // the one queue that started no match, ran no rounds and proved nothing.
      //
      // css_cr_bots is the other half: a team is a full team however it is
      // filled, and the plugin holds the count and the sides for both kinds of
      // player. A testing match now goes through exactly the same commands a
      // real one does, which is the entire point of having one.
      setStep("roster");
      await rconStep(match.id, "css_cr_reset");
      for (let i = 0; i < match.teams.length; i++) {
        const args = [
          `css_cr_team ${i} ${teamSlug(match.teams[i].name, `team-${i}`)}`,
          ...rosters[i],
        ];
        await rconStep(match.id, args.join(" "));

        if (botCounts[i] > 0) {
          await rconStep(match.id, `css_cr_bots ${i} ${botCounts[i]}`);
        }
      }
      await rconStep(match.id, `css_cr_side 0 ${match.teams[0].side === "T" ? "T" : "CT"}`);

      setStep("go");
      // The plugin answers every one of these commands, and the answer is the
      // only way to know it agreed. It replies "CR: started …" on success and
      // "CR: <why not>" on anything else — and because a refusal is a reply and
      // not an RCON error, not reading it meant a rejected match still ended up
      // on screen as ready.
      const started = String(await rconStep(match.id, `css_cr_go ${match.id}`) ?? "");
      if (!/CR:\s*started/i.test(started)) {
        throw new Error(`plugin refused the match: ${started.replace(/\s+/g, " ").trim() || "no reply"}`);
      }

      // Not load-bearing: it is here so the log carries the plugin's own account
      // of what it believes it was just told.
      await rconStep(match.id, "css_cr_status").catch(() => {});

      match.connect = CONNECT_ADDRESS;
      match.server = { state: "ready", step: null, error: null, competitive: true };
      const bots = botCounts[0] + botCounts[1];
      console.log(
        `[retakes ${match.id}] live on ${match.map} — ${CONNECT_ADDRESS}` +
        (bots > 0 ? ` (${botCounts[0]}/${botCounts[1]} bots)` : "")
      );
      syncMatch(match);
    } catch (err) {
      // No connect string, and the lobby is told so. A party sent to a server
      // that never came up spends the linger blaming its own game; being told
      // it failed is worse news and better information.
      match.connect = null;
      match.server = { state: "failed", step, error: failureCode(err) };
      console.error(`[retakes ${match.id}] start failed at "${step}":`, err?.message ?? err);
      syncMatch(match);
      for (const t of match.teams) {
        for (const p of t.players) {
          if (!p.bot) emitTo(p.steamId, "rq:notice", { kind: "error", code: "server_failed" });
        }
      }
    }
  }

  function finishVeto(match) {
    clearTimeout(matchTimers.get(match.id));
    match.phase = "ready";
    match.map = match.remaining[0] ?? match.pool[0];
    // Set once, in startServer, and only after the server has said it is on the
    // map. There is no fallback timer: an address for a server that is not
    // ready is worse than no address at all.
    match.connect = null;
    match.server = { state: "starting", step: "map", error: null };
    match.turnDeadline = null;
    matchTimers.set(
      match.id,
      setTimeout(() => {
        for (const t of match.teams) for (const p of t.players) if (!p.bot) matchOf.delete(p.steamId);
        matches.delete(match.id);
      }, READY_LINGER_MS)
    );
    syncMatch(match);

    startServer(match).catch((err) => console.error(`[retakes ${match.id}] start crashed:`, err));
  }

  function enqueue(party) {
    const q = queues.get(party.queue);
    if (!q || q.includes(party.id)) return;
    party.queuedAt = now();
    party.queueReason = null;
    q.push(party.id);

    // The bot-fill timer is armed for the training queue and nowhere else. It
    // used to be armed unconditionally, which is the whole of how bots would
    // have ended up in a competitive match: not a decision, a timeout.
    const cfg = queueOf(party);
    if (cfg.bots && cfg.botFillMs) {
      botTimers.set(party.id, setTimeout(() => fillWithBots(party), cfg.botFillMs));
    }

    tryMatch(party.queue);
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
      // Ratings and the captain's map preference arrive a moment later; the
      // lobby renders without them rather than waiting on a database round
      // trip to show a party of one.
      Promise.all([refreshRatings(party), refreshMapPrefs(party)]).then(() => syncParty(party));
    });

    /**
     * The mode buttons: a size, and the two toggles beside it.
     *
     * Takes the three separately rather than a queue id, because that is what
     * the buttons are — pressing Premium should not require the client to know
     * which of six queue keys "3v3, premium, not testing" spells. A raw `queue`
     * is still accepted so an older tab does not break mid-session.
     */
    socket.on("rq:party:queue", ({ size, premium, testing, queue } = {}) => {
      const id = me();
      const party = partyFor(id);
      if (!party || party.leader !== id) return;

      const current = queueOf(party);
      let next;
      if (isQueueId(queue)) {
        next = queue;
      } else {
        const wantSize = Object.hasOwn(SIZES, size) ? size : current.size;
        const wantTesting = testing ?? current.testing;
        const wantPremium = premium ?? current.premium;
        // Checked here as well as in the UI: a button that is not rendered is
        // not a permission, and this event arrives straight off a socket.
        if (wantPremium && !wantTesting && !isPremium(id)) {
          return socket.emit("rq:notice", { kind: "error", code: "premium_locked" });
        }
        next = queueKey(wantSize, wantPremium, wantTesting);
      }

      if (!isQueueId(next)) return;
      if (party.members.length > QUEUES[next].teamSize) {
        return socket.emit("rq:notice", { kind: "error", code: "party_too_big" });
      }
      leaveQueue(party, "queue_changed");
      party.queue = next;
      syncParty(party);
    });

    /**
     * Maps the captain will not be sent to, for this lobby.
     *
     * `save` writes it back to the account as the new default; without it the
     * change lives as long as the lobby does. Adjusting for one queue and
     * having that silently become your permanent preference is the kind of
     * thing you only notice three matches later.
     */
    socket.on("rq:party:maps", async ({ excluded, save } = {}) => {
      const id = me();
      const party = partyFor(id);
      if (!party || party.leader !== id) return;

      const pool = poolOf(party);
      const wanted = Array.isArray(excluded) ? excluded : [];
      if (wanted.length > MAX_EXCLUDED_MAPS) {
        return socket.emit("rq:notice", {
          kind: "error",
          code: "too_many_maps_excluded",
          max: MAX_EXCLUDED_MAPS,
        });
      }

      party.excludedMaps = sanitiseExcluded(wanted, pool);
      party.mapsTouched = true;
      // Changing what you will play mid-search would mean the queue you are in
      // was joined under different terms.
      leaveQueue(party, "maps_changed");
      syncParty(party);

      if (save && typeof saveMapPrefs === "function") {
        try {
          await saveMapPrefs(id, party.excludedMaps);
          socket.emit("rq:notice", { kind: "ok", code: "maps_saved" });
        } catch {
          socket.emit("rq:notice", { kind: "error", code: "maps_save_failed" });
        }
      }
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
      // Answered rather than swallowed. The invite list filters party members
      // out before it renders, so reaching this is either a stale list or
      // somebody driving the socket by hand — and both deserve to be told.
      if (partyOf.get(target) === party.id) {
        return socket.emit("rq:notice", { kind: "error", code: "already_in_party" });
      }
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

    socket.on("rq:queue:join", async ({ queue, safeQueue } = {}) => {
      const id = me();
      const party = partyFor(id);
      if (!party) return;
      if (party.leader !== id) return socket.emit("rq:notice", { kind: "error", code: "not_leader" });
      if (matchOf.get(id)) return;
      if (isQueueId(queue)) {
        if (party.members.length > QUEUES[queue].teamSize) {
          return socket.emit("rq:notice", { kind: "error", code: "party_too_big" });
        }
        party.queue = queue;
      }

      // The safe-queue toggle used to be sent and never read — the handler
      // destructured `{ queue }` and dropped the rest, so a checkbox people
      // were ticking did nothing at all. It now matches like with like: a party
      // that asked for it is only ever paired with another that did.
      //
      // That is weaker than gating on GardenSafeStatus, which is where this
      // should end up; opting in is at least a signal, and a control that acts
      // on it beats one that lies.
      party.safeQueue = Boolean(safeQueue);

      // Nobody queues without a loadout. Checked here and not only in the UI: a
      // disabled button is a courtesy, not a gate, and the round type a player
      // never chose for is the one the server has to invent an answer for.
      const unset = await membersWithoutLoadout(party);
      if (unset.length > 0) {
        return socket.emit("rq:notice", {
          kind: "error",
          code: "loadout_unset",
          who: unset,
          mine: unset.includes(id),
        });
      }

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
        tryMatch(party.queue);
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

    /**
     * The game server's live scoreline.
     *
     * Not a player event: this comes from the CS2 plugin over the same shared
     * secret the website already trusts it with for skins and StatTrak. The key
     * is checked on every message rather than once at connect, because a socket
     * has no session and treating the first message as authentication would
     * make every later one free.
     *
     * Fanned out to everybody: what is being played on the one server is not
     * private — anybody can connect and look — and it is what the Live tab
     * draws.
     */
    socket.on("rq:live", (payload = {}) => {
      const key = process.env.INVSIM_API_KEY;
      if (!key || payload?.apiKey !== key) {
        return;
      }

      let state = payload.state;
      if (typeof state === "string") {
        try {
          state = JSON.parse(state);
        } catch {
          return;
        }
      }
      if (!state || typeof state !== "object") return;

      liveState = { state, at: now() };
      io.emit("rq:live:state", liveState);
    });

    /** Whatever the server last said, for a tab that just opened. */
    socket.on("rq:live:get", () => {
      socket.emit("rq:live:state", liveState);
    });

    socket.on("rq:chat", ({ text, teamOnly } = {}) => {
      const id = me();
      const match = matches.get(matchOf.get(id));
      // Trim first, then cut: trimming after the slice let 240 spaces through as
      // a "message", and let a long line be cut mid-word for no reason.
      const body = String(text ?? "").trim().slice(0, CHAT_MAX_LENGTH);
      if (!match || !body) return;

      // Only people in the match may write to its log. Without this, anybody who
      // knew the event name could post into a lobby they were not in.
      const from = match.teams.flatMap((t) => t.players).find((p) => p.steamId === id);
      if (!from) return;

      if (!allowChat(id)) {
        return socket.emit("rq:notice", { kind: "error", code: "chat_rate_limited" });
      }

      let teamIndex = null;
      if (teamOnly) {
        const team = match.teams.find((t) => t.players.some((p) => p.steamId === id));
        if (team) teamIndex = team.index !== undefined ? team.index : match.teams.indexOf(team);
      }

      match.chat.push({ from: id, name: from.name ?? null, text: body, at: now(), team: teamIndex });
      if (match.chat.length > CHAT_HISTORY * 2) {
        match.chat = match.chat.slice(-CHAT_HISTORY);
      }
      syncMatch(match);
    });

    socket.on("disconnect", () => {
      const id = me();
      if (!id) return;
      invites.delete(id);
      chatHistory.delete(id);
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
      queued: Object.fromEntries(Object.keys(QUEUES).map((q) => [q, queuedPlayerCount(q)])),
      matches: matches.size,
    }),
  };
}

module.exports = {
  attachRetakesMatchmaking,
  QUEUES,
  SIZES,
  DEFAULT_QUEUE,
  DEFAULT_SIZE,
  MAP_POOLS,
  // Pure, and the parts most worth pinning: a queue key that stops round-
  // tripping, an exclusion list that empties a pool, or a floor that never
  // relaxes are all silent in review and obvious in a lobby.
  queueKey,
  resolveQueueId,
  sanitiseExcluded,
  allowedMaps,
  requiredPoolSize,
  effectiveElo,
  acceptableGap,
  MAX_EXCLUDED_MAPS,
  VETO_POOL_FLOOR,
  VETO_POOL_FLOOR_MIN,
};
