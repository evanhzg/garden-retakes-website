/**
 * Who may concede a map.
 *
 * The rules here are the ones that decide a match result on somebody else's
 * behalf, so the cases worth writing down are the refusals: a spectator with
 * the endpoint open, a player who is not the captain, a stale page pressing
 * concede on a match that has already finished. None of those are reachable by
 * clicking around, and all of them are reachable with curl.
 *
 * The captain rule differs from the in-game `.gg`, which needs the whole team.
 * See lib/tournament/surrender.ts for why: the server has no notion of
 * authority and the website does.
 */
import {
  decideSurrender,
  maySpeakForTeam,
  type SurrenderMember,
} from "@/lib/tournament/surrender";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};

const CAP = "76561198000000001";
const MATE = "76561198000000002";
const FOE = "76561198000000003";
const NOBODY = "76561198000000009";

const member = (steamId: string, over: Partial<SurrenderMember> = {}): SurrenderMember => ({
  steamId,
  isCaptain: false,
  status: "accepted",
  ...over,
});

const teamA = [member(CAP, { isCaptain: true }), member(MATE)];
const teamB = [member(FOE, { isCaptain: true })];

const live = { state: "live", teamA, teamB };

// ---- the happy path -------------------------------------------------------

const capA = decideSurrender({ ...live, steamId: CAP });
check("a captain may concede", capA.ok === true);
check("conceding puts the loss on their own team", capA.ok === true && capA.slot === "a");
check("and the win on the other one", capA.ok === true && capA.winner === "b");
check("a player surrender is not an admin one", capA.ok === true && capA.asAdmin === false);

const capB = decideSurrender({ ...live, steamId: FOE });
check("the other captain concedes for their own side", capB.ok === true && capB.slot === "b");
check("and hands the win the other way", capB.ok === true && capB.winner === "a");

// ---- the refusals ---------------------------------------------------------

const mate = decideSurrender({ ...live, steamId: MATE });
check("a non-captain teammate may not concede", mate.ok === false);
check(
  "and is told why, rather than that they are not playing",
  mate.ok === false && /captain/i.test(mate.error),
  mate.ok === false ? mate.error : "",
);

const stranger = decideSurrender({ ...live, steamId: NOBODY });
check("somebody not on either roster may not concede", stranger.ok === false);
check(
  "a spectator is told they are not playing",
  stranger.ok === false && /not playing/i.test(stranger.error),
  stranger.ok === false ? stranger.error : "",
);

const anon = decideSurrender({ ...live, steamId: null });
check("signed out cannot concede", anon.ok === false);

// ---- match state ----------------------------------------------------------

for (const state of ["pending", "veto"]) {
  const r = decideSurrender({ ...live, state, steamId: CAP });
  check(`a ${state} match cannot be conceded`, r.ok === false);
  check(
    `and says it is not being played yet (${state})`,
    r.ok === false && /not being played/i.test(r.error),
    r.ok === false ? r.error : "",
  );
}

for (const state of ["finished", "forfeit"]) {
  const r = decideSurrender({ ...live, state, steamId: CAP });
  check(`a ${state} match cannot be conceded again`, r.ok === false);
  check(
    `and says it already ended (${state})`,
    r.ok === false && /already ended/i.test(r.error),
    r.ok === false ? r.error : "",
  );
}

check(
  "a ready match can be conceded without waiting for the knife",
  decideSurrender({ ...live, state: "ready", steamId: CAP }).ok === true,
);

// ---- teams without a usable captain ---------------------------------------

const headless = [member(MATE), member(NOBODY)];
check(
  "with no captain at all, any active player may concede",
  decideSurrender({ state: "live", teamA: headless, teamB, steamId: MATE }).ok === true,
);

// The case that made this a function rather than `m.isCaptain`: the captain
// slot on a pickup team is filled by whoever was drafted first, and on an
// all-bot side that is a bot. A human on that team must still be able to give
// up, or a 1v1 against bots can never be conceded.
const botLed = [member(CAP, { isCaptain: true, isBot: true }), member(MATE)];
check(
  "a bot captain does not block the humans behind it",
  decideSurrender({ state: "live", teamA: botLed, teamB, steamId: MATE }).ok === true,
);

const invited = [member(CAP, { isCaptain: true }), member(MATE, { status: "invited" })];
check(
  "somebody who never accepted is not on the team for this",
  decideSurrender({ state: "live", teamA: invited, teamB, steamId: MATE }).ok === false,
);
check(
  "a removed captain does not keep the right to concede",
  maySpeakForTeam(CAP, [member(CAP, { isCaptain: true, status: "removed" }), member(MATE)]) === false,
);
check(
  "and the team is not left unable to concede by their removal",
  maySpeakForTeam(MATE, [member(CAP, { isCaptain: true, status: "removed" }), member(MATE)]) === true,
);

// ---- admins ---------------------------------------------------------------

const adminA = decideSurrender({ ...live, steamId: NOBODY, isAdmin: true, adminSlot: "a" });
check("an organizer may concede for a team they are not on", adminA.ok === true);
check("for the team they named", adminA.ok === true && adminA.slot === "a");
check("and it is marked as an admin action", adminA.ok === true && adminA.asAdmin === true);
check(
  "an admin still cannot concede a finished match",
  decideSurrender({ ...live, state: "finished", steamId: NOBODY, isAdmin: true, adminSlot: "a" })
    .ok === false,
);
check(
  "an admin who names no team falls back to the player rules",
  decideSurrender({ ...live, steamId: NOBODY, isAdmin: true }).ok === false,
);

// A captain who is also an organizer, pressing the button on their own match
// page without naming a team, should concede their own side — not be refused
// and not be handed the admin path by accident.
const both = decideSurrender({ ...live, steamId: CAP, isAdmin: true });
check("an organizer playing the match concedes their own team", both.ok === true && both.slot === "a");
check("and does so as a player", both.ok === true && both.asAdmin === false);

// ---- a roster that should not exist ---------------------------------------

const onBoth = decideSurrender({
  state: "live",
  teamA: [member(CAP, { isCaptain: true })],
  teamB: [member(CAP, { isCaptain: true })],
  steamId: CAP,
});
check("somebody captaining both teams is refused, not guessed at", onBoth.ok === false);
check(
  "and told to find an organizer",
  onBoth.ok === false && /organizer/i.test(onBoth.error),
  onBoth.ok === false ? onBoth.error : "",
);

console.log(fails === 0 ? "\nsurrender: all good" : `\nsurrender: ${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
