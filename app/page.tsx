import { prisma } from "@/lib/db";
import { registrationBlockedReason, type EditionState } from "@/lib/tournament/edition";
import TournamentHome, {
  type HomeStats,
  type HomeOngoing,
  type HomeTournament,
} from "@/components/home/TournamentHome";

// The homepage is the tournament system.
//
// What used to be here — the ladder, the live card, the podium, the clips — has
// moved to /community rather than being deleted; it is a real page about a real
// part of the site, it is just no longer the first thing a visitor meets.
//
// The numbers below are counted rather than written down. A page that claims
// "500 matches played" and is wrong about it is worse than a page that claims
// nothing, and the only way to keep a hardcoded figure honest is to remember to
// change it, which nobody does.
export const dynamic = "force-dynamic";
export const revalidate = 60;

export default async function HomePage() {
  const [tournamentsPlayed, matchesPlayed, playerRows, candidates, started] = await Promise.all([
    prisma.tournament.count({ where: { Published: true, State: "finished" } }),
    prisma.tournamentMatch.count({
      where: { State: "finished", Tournament: { Published: true } },
    }),
    // Distinct players who have actually appeared in a PUBLISHED tournament
    // match. groupBy rather than a count of memberships: somebody entering
    // three events is one player, and counting rosters would say three.
    //
    // The published filter matters and was missing at first: without it the
    // count picked up every bot in an unpublished test tournament and reported
    // them as players, which is exactly the sort of number this page exists not
    // to print. The other two counts were already filtered, so the three
    // disagreed with each other.
    prisma.tournamentPlayerStat.groupBy({
      by: ["SteamId"],
      where: { Match: { Tournament: { Published: true } } },
    }),
    // Something to point at. Preference goes to whatever a visitor can act on:
    // an event taking registrations beats one already running, which beats one
    // merely scheduled.
    prisma.tournament.findMany({
      where: { Published: true, State: { notIn: ["finished", "cancelled"] } },
      orderBy: [{ StartsAt: "asc" }, { Id: "asc" }],
      take: 8,
      include: { _count: { select: { Teams: true } } },
    }),
    // What is actually being played, for the card above the counts.
    //
    // A different question from `featured` above, which answers "what can a
    // visitor DO" and therefore prefers an event still taking registrations.
    // This one answers "what is on right now", so it is ordered by when things
    // started and takes the finished ones too — the fallback is the last one
    // that ran, and only when nothing has ever run does the card go empty.
    prisma.tournament.findMany({
      where: { Published: true, StartedAt: { not: null }, State: { not: "cancelled" } },
      orderBy: [{ StartedAt: "desc" }, { Id: "desc" }],
      take: 4,
      include: { _count: { select: { Teams: true } } },
    }),
  ]);

  const stats: HomeStats = {
    tournamentsPlayed,
    matchesPlayed,
    playersPlayed: playerRows.length,
  };

  const withState = candidates.map((tournament) => {
    const edition: EditionState = {
      published: tournament.Published,
      state: tournament.State,
      visibility: tournament.Visibility === "invite" ? "invite" : "public",
      maxTeams: tournament.MaxTeams,
      teamCount: tournament._count.Teams,
      startsAt: tournament.StartsAt,
      startedAt: tournament.StartedAt,
    };

    return {
      tournament,
      // The same predicate the register page and the API use, so the button
      // cannot offer what the server would refuse.
      canRegister: registrationBlockedReason(edition, false) === null,
    };
  });

  const pick =
    withState.find((x) => x.canRegister) ??
    withState.find((x) => x.tournament.StartedAt !== null) ??
    withState[0] ??
    null;

  const featured: HomeTournament | null = pick
    ? {
        slug: pick.tournament.Slug,
        name: pick.tournament.Name,
        state: pick.tournament.State,
        startsAt: pick.tournament.StartsAt?.toISOString() ?? null,
        teamCount: pick.tournament._count.Teams,
        maxTeams: pick.tournament.MaxTeams,
        teamSize: pick.tournament.TeamSize,
        canRegister: pick.canRegister,
      }
    : null;

  // Live first, then the most recent to have run. Both are already ordered by
  // StartedAt descending, so this is "the newest one still going, else the
  // newest one at all" without a second sort.
  const live = started.find((x) => x.State !== "finished") ?? started[0] ?? null;

  const ongoing: HomeOngoing | null = live
    ? {
        slug: live.Slug,
        name: live.Name,
        state: live.State,
        live: live.State !== "finished",
        startedAt: live.StartedAt?.toISOString() ?? null,
        teamCount: live._count.Teams,
        maxTeams: live.MaxTeams,
        teamSize: live.TeamSize,
      }
    : null;

  return <TournamentHome stats={stats} featured={featured} ongoing={ongoing} />;
}
