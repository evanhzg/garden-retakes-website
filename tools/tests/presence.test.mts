/**
 * What one player looks like to another.
 *
 * Three sources that disagree on purpose — the socket, the game feed, and the
 * status somebody chose — and the precedence between them is the whole of the
 * feature. Getting it wrong is invisible: nobody reports "I showed as online
 * while invisible", they quietly stop trusting the dots.
 */
import {
  acceptsMessages,
  friendOrder,
  isChosenStatus,
  shownPresence,
  type ShownPresence,
} from "@/lib/presence";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};

const p = (over: Partial<Parameters<typeof shownPresence>[0]> = {}) =>
  shownPresence({ connected: false, inGame: null, chosen: null, ...over });

// ---- the plain cases ------------------------------------------------------

check("nobody home is offline", p() === "offline");
check("a tab open is online", p({ connected: true }) === "online");
check("in a server is in game", p({ inGame: "playing" }) === "ingame");
check("watching is spectating", p({ inGame: "spectating" }) === "spectating");
check("no chosen status means online", p({ connected: true, chosen: null }) === "online");
check("explicitly online is online", p({ connected: true, chosen: "online" }) === "online");

// ---- invisible is total ---------------------------------------------------

check("invisible reads as offline", p({ connected: true, chosen: "invisible" }) === "offline");
check(
  "and stays offline in a game — that is the case you pick it for",
  p({ connected: true, inGame: "playing", chosen: "invisible" }) === "offline",
);
check(
  "invisible and genuinely offline are indistinguishable",
  p({ chosen: "invisible" }) === p({ chosen: null }),
);

// ---- dnd is a request, and it does not lapse ------------------------------

check("dnd shows as dnd", p({ connected: true, chosen: "dnd" }) === "dnd");
check(
  "dnd survives being in a game",
  p({ connected: true, inGame: "playing", chosen: "dnd" }) === "dnd",
);
check("dnd stops messages", !acceptsMessages("dnd"));
check("everything else accepts them", ["online", "away", "invisible", null].every(acceptsMessages));

// ---- away is the one an observation beats --------------------------------

check("away shows as away", p({ connected: true, chosen: "away" }) === "away");
check(
  "...but playing beats it, because the server just disproved it",
  p({ connected: true, inGame: "playing", chosen: "away" }) === "ingame",
);
check(
  "and spectating does too",
  p({ connected: true, inGame: "spectating", chosen: "away" }) === "spectating",
);
check(
  "away with no connection at all is still offline",
  p({ chosen: "away" }) === "offline",
);

// ---- the guard ------------------------------------------------------------

check("the four are accepted", ["online", "away", "dnd", "invisible"].every(isChosenStatus));
check("anything else is not", !isChosenStatus("busy") && !isChosenStatus("") && !isChosenStatus(1));

// ---- the friends list order ----------------------------------------------

const f = (name: string, presence: ShownPresence, lastSeen: number | null) => ({ name, presence, lastSeen });

const ordered = friendOrder([
  f("offlineOld", "offline", 100),
  f("onlineB", "online", 500),
  f("playing", "ingame", 200),
  f("offlineNew", "offline", 900),
  f("onlineA", "online", 800),
]);

check(
  "in a game first, then online, then offline",
  ordered.map((x) => x.name).join() === "playing,onlineA,onlineB,offlineNew,offlineOld",
  ordered.map((x) => x.name).join(),
);
check("most recently seen leads within a group", ordered[1].name === "onlineA");
check("and offline sorts the same way", ordered[3].name === "offlineNew");

// An unknown last-seen cannot be ordered against a known one, so it goes last
// rather than being treated as "very long ago" — which would be a claim.
const withNull = friendOrder([f("known", "offline", 5), f("unknown", "offline", null)]);
check("an unknown last-seen sorts last", withNull.map((x) => x.name).join() === "known,unknown");

// Ties must not reshuffle between renders.
const tie = friendOrder([f("bravo", "online", 1), f("alpha", "online", 1)]);
check("ties break on name, stably", tie.map((x) => x.name).join() === "alpha,bravo");

check(
  "dnd sorts below online but above offline — still reachable, just asking not to be",
  friendOrder([f("off", "offline", 9), f("busy", "dnd", 1), f("on", "online", 1)])
    .map((x) => x.name)
    .join() === "on,busy,off",
);

console.log(fails === 0 ? "\npresence: all good" : `\npresence: ${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
