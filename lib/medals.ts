import "server-only";
import { prisma } from "@/lib/db";

// Medals, and the community vote that hands some of them out.
//
// Two sources. Placement medals are a fact — top three on the final ladder —
// and are awarded from the standings. The rest are opinions, so they are voted
// on for a fixed window at the end of a season and awarded to whoever wins.
//
// The vote is deliberately small: five questions, one answer each, ten
// candidates. A ballot people finish is worth more than a thorough one they
// abandon.

export type MedalDef = {
  slug: string;
  name: string;
  description: string;
  icon: string;
  colour: string;
  kind: "season" | "vote" | "special";
  sort: number;
};

/** Placement medals, awarded from the final ladder rather than voted on. */
export const PLACEMENT_MEDALS: MedalDef[] = [
  { slug: "season-first", name: "Champion", description: "Finished a season first on the ladder.", icon: "/medals/season-1-top-1.jpg", colour: "#e8b53a", kind: "season", sort: 1 },
  { slug: "season-second", name: "Runner-up", description: "Finished a season second on the ladder.", icon: "/medals/season-1-top-2.jpg", colour: "#b9c0c7", kind: "season", sort: 2 },
  { slug: "season-third", name: "Third place", description: "Finished a season third on the ladder.", icon: "/medals/season-1-top-3.jpg", colour: "#c98b4b", kind: "season", sort: 3 },
  { slug: "pre-season-1", name: "Pre-season 1 Participant", description: "Played in Pre-season 1.", icon: "/medals/pre-season-1.jpg", colour: "#5fc9c9", kind: "season", sort: 4 },
];

/**
 * The ballot. Five questions, mostly for fun — the ladder already measures who
 * was best, so asking again would be a worse version of a number we have.
 */
export const VOTE_CATEGORIES: { slug: string; name: string; description: string; medal: MedalDef }[] = [
  {
    slug: "clutch",
    name: "Ice in the veins",
    description: "Who you actually wanted alive in a 1v3.",
    medal: { slug: "medal-clutch", name: "Ice in the veins", description: "Voted the one you wanted alive in a 1v3.", icon: "/medals/medal-clutch.jpg", colour: "#5fc9c9", kind: "vote", sort: 10 },
  },
  {
    slug: "entry",
    name: "First one through",
    description: "Opens the site and asks questions later.",
    medal: { slug: "medal-entry", name: "First one through", description: "Voted the one who always opens the site.", icon: "/medals/medal-entry.jpg", colour: "#e8703a", kind: "vote", sort: 11 },
  },
  {
    slug: "utility",
    name: "Smoke criminal",
    description: "Best — or most memorable — utility.",
    medal: { slug: "medal-utility", name: "Smoke criminal", description: "Voted for the most memorable utility.", icon: "/medals/medal-utility.jpg", colour: "#8bb8d8", kind: "vote", sort: 12 },
  },
  {
    slug: "chaos",
    name: "Agent of chaos",
    description: "You never know what they are about to do. Neither do they.",
    medal: { slug: "medal-chaos", name: "Agent of chaos", description: "Voted the least predictable player on the server.", icon: "/medals/medal-chaos.jpg", colour: "#b58fd8", kind: "vote", sort: 13 },
  },
  {
    slug: "voice",
    name: "Loudest in comms",
    description: "The one you hear before you see.",
    medal: { slug: "medal-voice", name: "Loudest in comms", description: "Voted the one you hear before you see.", icon: "/medals/medal-voice.jpg", colour: "#e85fa8", kind: "vote", sort: 14 },
  },
];

export const ALL_MEDALS: MedalDef[] = [...PLACEMENT_MEDALS, ...VOTE_CATEGORIES.map((c) => c.medal)];

/** How long a poll stays open. */
export const POLL_HOURS = 72;

/** Candidates: the season's top ten. */
export const CANDIDATE_COUNT = 10;

/** Write the medal definitions, so a fresh database has them. */
export async function ensureMedals(): Promise<void> {
  for (const m of ALL_MEDALS) {
    await prisma.gardenMedal.upsert({
      where: { Slug: m.slug },
      create: {
        Slug: m.slug,
        Name: m.name,
        Description: m.description,
        Icon: m.icon,
        Colour: m.colour,
        Kind: m.kind,
        Sort: m.sort,
      },
      // Definitions are code, so a redeploy corrects a hand-edited row.
      update: { Name: m.name, Description: m.description, Icon: m.icon, Colour: m.colour, Kind: m.kind, Sort: m.sort },
    });
  }
}

export type Medal = MedalDef & { note: string | null; seasonId: number; awardedAt: string };

/** Everything a player holds, best-known order. */
export async function medalsFor(steamIds: bigint[]): Promise<Map<string, Medal[]>> {
  const out = new Map<string, Medal[]>();
  if (steamIds.length === 0) return out;

  const [rows, defs] = await Promise.all([
    prisma.gardenPlayerMedal.findMany({ where: { SteamId: { in: steamIds } }, orderBy: { AwardedAt: "desc" } }),
    prisma.gardenMedal.findMany(),
  ]);
  const byslug = new Map(defs.map((d) => [d.Slug, d]));

  for (const r of rows) {
    const def = byslug.get(r.MedalSlug);
    if (!def) continue;
    const key = r.SteamId.toString();
    if (!out.has(key)) out.set(key, []);
    out.get(key)!.push({
      slug: def.Slug,
      name: def.Name,
      description: def.Description,
      icon: def.Icon,
      colour: def.Colour,
      kind: def.Kind as MedalDef["kind"],
      sort: def.Sort,
      note: r.Note,
      seasonId: r.SeasonId,
      awardedAt: r.AwardedAt.toISOString(),
    });
  }
  Array.from(out.values()).forEach((list) => list.sort((a, b) => a.sort - b.sort));
  return out;
}

/** Award, idempotently — running the placement job twice must not duplicate. */
export async function award(steamId: bigint, slug: string, seasonId: number, note?: string): Promise<void> {
  await prisma.gardenPlayerMedal.upsert({
    where: { SteamId_MedalSlug_SeasonId: { SteamId: steamId, MedalSlug: slug, SeasonId: seasonId } },
    create: { SteamId: steamId, MedalSlug: slug, SeasonId: seasonId, Note: note ?? null },
    update: { Note: note ?? null },
  });
}
