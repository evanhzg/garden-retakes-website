/**
 * MVP cards, player of the month, and how tournaments are grouped.
 *
 * The failures worth catching here are the quiet ones. An MVP picked without a
 * rounds floor is whoever went 4-0 in one map and left. A "player of the
 * month" computed over the CURRENT month crowns nobody on the 1st and changes
 * every hour after that. And a comparator that can return 0 hands the top of
 * the page to whatever order the database happened to return, which is stable
 * right up until it is not.
 */
import {
  MONTH_MIN_ROUNDS,
  MVP_MIN_ROUNDS,
  compareContenders,
  inWindow,
  lastMonthWindow,
  mvpLine,
  pickMvp,
  splitTournaments,
  type Contender,
  type TournamentLike,
} from "@/lib/tournament/honours";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};

const p = (over: Partial<Contender> & { steamId: string }): Contender => ({
  name: "p" + over.steamId,
  ratingAvg: 1,
  roundsPlayed: 100,
  kills: 50,
  damage: 8000,
  ...over,
});

/* ---------------------------------------------------------------- the floor */

check(
  "nobody below the floor can be MVP",
  pickMvp([p({ steamId: "1", ratingAvg: 2.4, roundsPlayed: MVP_MIN_ROUNDS - 1 })]) === null,
);

check(
  "exactly the floor qualifies",
  pickMvp([p({ steamId: "1", ratingAvg: 1.1, roundsPlayed: MVP_MIN_ROUNDS })])?.steamId === "1",
);

check("an empty field has no MVP", pickMvp([]) === null);

check(
  "a huge rating over four rounds loses to a good one over a season",
  pickMvp([
    p({ steamId: "spike", ratingAvg: 3.0, roundsPlayed: 4 }),
    p({ steamId: "real", ratingAvg: 1.21, roundsPlayed: 300 }),
  ])?.steamId === "real",
);

check(
  "the month floor is lower than the career floor",
  MONTH_MIN_ROUNDS < MVP_MIN_ROUNDS,
);

/* ------------------------------------------------------------ tie-breaking */

check(
  "rounds break a rating tie",
  pickMvp([
    p({ steamId: "a", ratingAvg: 1.2, roundsPlayed: 40 }),
    p({ steamId: "b", ratingAvg: 1.2, roundsPlayed: 90 }),
  ])?.steamId === "b",
);

check(
  "kills break a rating and rounds tie",
  pickMvp([
    p({ steamId: "a", ratingAvg: 1.2, roundsPlayed: 40, kills: 30 }),
    p({ steamId: "b", ratingAvg: 1.2, roundsPlayed: 40, kills: 44 }),
  ])?.steamId === "b",
);

check(
  "identical lines still order deterministically, by id",
  compareContenders(p({ steamId: "1" }), p({ steamId: "2" })) < 0 &&
    compareContenders(p({ steamId: "2" }), p({ steamId: "1" })) > 0,
);

check("a line ties with itself", compareContenders(p({ steamId: "7" }), p({ steamId: "7" })) === 0);

check(
  "sorting is not left to input order",
  (() => {
    const one = [p({ steamId: "9" }), p({ steamId: "3" })].sort(compareContenders)[0].steamId;
    const two = [p({ steamId: "3" }), p({ steamId: "9" })].sort(compareContenders)[0].steamId;
    return one === two;
  })(),
);

/* ------------------------------------------------------------- the window */

{
  const w = lastMonthWindow(new Date("2026-03-14T12:00:00Z"));
  check("mid-month asks for the month before", w.year === 2026 && w.month === 2);
  check("the window starts on the 1st", w.start.toISOString() === "2026-02-01T00:00:00.000Z");
  check("and ends at the next 1st", w.end.toISOString() === "2026-03-01T00:00:00.000Z");
}

{
  const w = lastMonthWindow(new Date("2026-01-01T00:00:00Z"));
  check("January asks for December of the year before", w.year === 2025 && w.month === 12);
}

{
  const w = lastMonthWindow(new Date("2024-03-05T00:00:00Z"));
  check(
    "a leap February is 29 days, not 28",
    (w.end.getTime() - w.start.getTime()) / 86_400_000 === 29,
  );
}

{
  const w = lastMonthWindow(new Date("2026-03-14T12:00:00Z"));
  check("the first instant of the month is in", inWindow(new Date("2026-02-01T00:00:00Z"), w));
  check("the last instant of the month is in", inWindow(new Date("2026-02-28T23:59:59Z"), w));
  check("the first instant of the next is out", !inWindow(new Date("2026-03-01T00:00:00Z"), w));
  check("the instant before the month is out", !inWindow(new Date("2026-01-31T23:59:59Z"), w));
  check("a match that never ended is out", !inWindow(null, w));
}

/* --------------------------------------------------------- the two groups */

const tour = (over: Partial<TournamentLike> & { id: number }): TournamentLike => ({
  slug: "t" + over.id,
  name: "T" + over.id,
  state: "finished",
  startsAt: null,
  endedAt: null,
  ...over,
});

{
  const { current, past } = splitTournaments([
    tour({ id: 1, state: "draft" }),
    tour({ id: 2, state: "cancelled" }),
    tour({ id: 3, state: "registration", startsAt: new Date("2026-09-01T00:00:00Z") }),
    tour({ id: 4, state: "live", startsAt: new Date("2026-08-20T00:00:00Z") }),
    tour({ id: 5, state: "finished", endedAt: new Date("2026-07-01T00:00:00Z") }),
    tour({ id: 6, state: "finished", endedAt: new Date("2026-08-01T00:00:00Z") }),
  ]);

  check("live comes before registration", current.map((t) => t.id).join() === "4,3");
  check("finished are newest first", past.map((t) => t.id).join() === "6,5");
  check(
    "draft and cancelled are in neither list",
    ![...current, ...past].some((t) => t.state === "draft" || t.state === "cancelled"),
  );
}

{
  const list = [tour({ id: 1, state: "live" }), tour({ id: 2 })];
  const copy = list.slice();
  splitTournaments(list);
  check("the input array is not reordered", list.every((t, i) => t === copy[i]));
}

{
  const two = splitTournaments([
    tour({ id: 1, state: "registration", startsAt: new Date("2026-09-05T00:00:00Z") }),
    tour({ id: 2, state: "registration", startsAt: new Date("2026-09-01T00:00:00Z") }),
  ]);
  check("two open sign-ups: the one starting sooner is first", two.current[0].id === 2);
}

/* ---------------------------------------------------------------- the card */

{
  const line = mvpLine(p({ steamId: "1", ratingAvg: 1.238, damage: 9000, roundsPlayed: 100 }));
  check("rating is two decimals", line.rating === "1.24");
  check("ADR is damage over rounds, rounded", line.adr === "90");
  check("rounds is the count", line.rounds === "100");
}

check(
  "no rounds does not divide by zero",
  mvpLine(p({ steamId: "1", roundsPlayed: 0, damage: 0 })).adr === "0",
);

console.log(fails === 0 ? "\nhonours: all good" : `\nhonours: ${fails} failed`);
process.exit(fails === 0 ? 0 : 1);
