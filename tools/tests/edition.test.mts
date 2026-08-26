/**
 * The rules an edition runs by.
 *
 * These are the decisions that decide whether somebody can register, whether an
 * organizer can still change the format, and who is being waited on in a veto —
 * all of which are wrong in ways that look like nothing until a real event.
 */
import {
  canEditFormat,
  canRegister,
  countdown,
  formatRemaining,
  isFull,
  registrationBlockedReason,
  seedTeams,
  vetoExpired,
  vetoMayStart,
  vetoRemaining,
  type EditionState,
} from "@/lib/tournament/edition";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};

const base: EditionState = {
  published: true,
  state: "registration",
  visibility: "public",
  maxTeams: 8,
  teamCount: 2,
  startsAt: null,
  startedAt: null,
};

// ---- Registration ----
check("open when published, in registration and not full", canRegister(base, false));
check("closed before it is published", !canRegister({ ...base, published: false }, false));
check("closed once started", !canRegister({ ...base, startedAt: new Date() }, false));
check("closed when the state is not registration", !canRegister({ ...base, state: "live" }, false));
check("closed when full", !canRegister({ ...base, teamCount: 8 }, false));
check("full counts at or above the cap", isFull({ ...base, teamCount: 9 }));

const inviteOnly: EditionState = { ...base, visibility: "invite" };
check("invite-only refuses without a link", !canRegister(inviteOnly, false));
check("invite-only allows with a link", canRegister(inviteOnly, true));

// A full invite-only tournament should say FULL, not "bad link". The link is
// fine; blaming the visitor for the organizer's cap is the wrong message.
check(
  "full beats invite-only in the reason given",
  registrationBlockedReason({ ...inviteOnly, teamCount: 8 }, false) === "full",
);
check("an unpublished tournament says so first", registrationBlockedReason({ ...base, published: false }, true) === "not-published");

// ---- Format editing ----
check("format is editable before the start button", canEditFormat(base));
check("format is frozen after it", !canEditFormat({ ...base, startedAt: new Date() }));
// Late starts are explicitly allowed, so a passed StartsAt must NOT freeze it.
check(
  "a passed start time alone does not freeze the format",
  canEditFormat({ ...base, startsAt: new Date(Date.now() - 60_000) }),
);

// ---- Countdown ----
const now = new Date("2026-08-30T18:00:00Z");
check("no date, nothing to say", countdown(base, now).kind === "none");
check(
  "three weeks out is a date, not a countdown",
  countdown({ ...base, startsAt: new Date("2026-09-20T18:00:00Z") }, now).kind === "scheduled",
);
check(
  "two hours out counts down",
  countdown({ ...base, startsAt: new Date("2026-08-30T20:00:00Z") }, now).kind === "counting",
);
check(
  "past its time and unstarted is Starting Soon, not an error",
  countdown({ ...base, startsAt: new Date("2026-08-30T17:00:00Z") }, now).kind === "starting-soon",
);
check(
  "started beats every other case",
  countdown({ ...base, startsAt: new Date("2026-09-20T18:00:00Z"), startedAt: now }, now).kind === "live",
);

check("hours and minutes", formatRemaining(4 * 3600_000 + 12 * 60_000) === "4h 12m");
check("minutes and padded seconds", formatRemaining(12 * 60_000 + 5_000) === "12m 05s");
check("seconds alone", formatRemaining(45_000) === "45s");
check("never negative", formatRemaining(-5_000) === "0s");

// ---- Veto ----
check("both ready starts it", vetoMayStart(true, true, false));
check("one ready does not", !vetoMayStart(true, false, false));
check("an admin can force it with neither ready", vetoMayStart(false, false, true));

const deadline = new Date("2026-08-30T18:00:30Z");
check("30 seconds left at the top of the turn", vetoRemaining(deadline, now) === 30_000);
check("not expired while time remains", !vetoExpired(deadline, now));
check("expired at the deadline", vetoExpired(deadline, new Date("2026-08-30T18:00:30Z")));
check("no deadline is not an expired one", !vetoExpired(null, now));

// ---- Seeding ----
const teams = [
  { id: 1, faceitAverage: 6 },
  { id: 2, faceitAverage: 9 },
  { id: 3, faceitAverage: null },
  { id: 4, faceitAverage: 7 },
];

const byFaceit = seedTeams(teams, "faceit");
check("best level seeds first", byFaceit[0].id === 2);
check("then the next best", byFaceit[1].id === 4);
check("unranked sorts last, not as zero", byFaceit[byFaceit.length - 1].id === 3);

check("manual keeps the given order", seedTeams(teams, "manual").map((t) => t.id).join() === "1,2,3,4");

// A fixed generator makes the shuffle checkable at all.
const fixed = (() => {
  const values = [0.99, 0.1, 0.5, 0.7];
  let i = 0;
  return () => values[i++ % values.length];
})();
const shuffled = seedTeams(teams, "random", fixed);
check("random keeps every team exactly once", shuffled.length === 4 && new Set(shuffled.map((t) => t.id)).size === 4);
check("random does not mutate the input", teams[0].id === 1);

// Two unranked teams must still order deterministically, or a regenerated
// bracket reshuffles for no reason.
const bothUnranked = seedTeams(
  [{ id: 5, faceitAverage: null }, { id: 2, faceitAverage: null }],
  "faceit",
);
check("unranked ties break on id", bothUnranked.map((t) => t.id).join() === "2,5");

if (fails) {
  console.log(`\n${fails} failed`);
  process.exit(1);
}
