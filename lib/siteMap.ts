/**
 * Every public destination on the site, once.
 *
 * The rail (components/NavBar.tsx) is a curated shortlist with icons and
 * primary/overflow flags; this is the complete map. The command palette
 * searches it, the footer draws it, /sitemap.xml lists it and the 404 page
 * suggests from it — four consumers that used to mean four hand-kept lists, or
 * (more often) pages nothing linked to at all.
 *
 * Import-free on purpose: server components (footer, sitemap) and client ones
 * (palette) both read it, and a server component cannot read a constant out of
 * a "use client" module — it gets a reference, not the value.
 *
 * Labels and descriptions are translation keys, English in `label`/`desc` as
 * the fallback the dictionaries also carry.
 */

export type SiteGroup = "play" | "compete" | "community" | "resources" | "account";

export type SiteEntry = {
  href: string;
  group: SiteGroup;
  label: string;
  labelKey: string;
  desc: string;
  descKey: string;
  /** Extra words people search with that are not in the label. */
  keywords?: string;
  /** Needs a signed-in session to be useful. */
  auth?: boolean;
  /** Worth listing in /sitemap.xml (public, stable, indexable). */
  index?: boolean;
};

export const SITE_GROUPS: { id: SiteGroup; label: string; key: string }[] = [
  { id: "play", label: "Play", key: "site.group.play" },
  { id: "compete", label: "Compete", key: "site.group.compete" },
  { id: "community", label: "Community", key: "site.group.community" },
  { id: "resources", label: "Resources", key: "site.group.resources" },
  { id: "account", label: "Account", key: "site.group.account" },
];

const e = (
  href: string,
  group: SiteGroup,
  slug: string,
  label: string,
  desc: string,
  extra: Partial<Pick<SiteEntry, "keywords" | "auth" | "index">> = {},
): SiteEntry => ({
  href,
  group,
  label,
  labelKey: `site.${slug}.label`,
  desc,
  descKey: `site.${slug}.desc`,
  index: true,
  ...extra,
});

export const SITE_MAP: SiteEntry[] = [
  // play
  e("/lobby", "play", "lobby", "Matchmaking", "Queue for a retakes match with roles, veto and a server.", { keywords: "queue play match party" }),
  e("/live", "play", "live", "Live", "Who is on the server right now, round by round.", { keywords: "server now spectate scoreboard" }),
  e("/inventory", "play", "inventory", "Inventory", "Loadouts, skins, stickers and agents that sync in game.", { keywords: "skins loadout knife gloves agent sticker", auth: false }),
  e("/utility", "play", "utility", "Utility", "Smokes, flashes and mollies with exact positions, on every map.", { keywords: "nades grenades smoke flash molly lineups" }),

  // compete
  e("/stats", "compete", "stats", "Stats", "The ladder: ELO, rating, K/D and ADR for every player.", { keywords: "ladder ranking leaderboard elo top" }),
  e("/insights", "compete", "insights", "Insights", "Aim, utility, teamplay, positioning and trading, scored against the server.", { keywords: "analytics trends data aim" }),
  e("/stats/seasons", "compete", "seasons", "Seasons", "Past seasons and their final standings.", { keywords: "history archive season" }),
  e("/stats/maps", "compete", "maps", "Maps", "Win rates and round stats per map.", { keywords: "dust mirage inferno ancient anubis" }),
  e("/stats/heatmaps", "compete", "heatmaps", "Heatmaps", "Where kills and deaths happen, per map.", { keywords: "positions kills deaths" }),
  e("/stats/form", "compete", "form", "Recent form", "Your last ten sessions: rating, K/D, ADR and how each went.", { keywords: "streak trend recent sessions" }),
  e("/compare", "compete", "compare", "Compare", "Put two players side by side.", { keywords: "versus vs head to head" }),
  e("/tournaments", "compete", "tournaments", "Tournaments", "Cups and events: brackets, schedules, sign-ups.", { keywords: "cup event bracket register" }),
  e("/teams", "compete", "teams", "Teams", "Standing teams and the Blitz ladder.", { keywords: "blitz squad roster" }),
  e("/duels", "compete", "duels", "Duels", "1v1 duels on the Blitz circuit — coming soon.", { keywords: "1v1 aim" }),

  // community
  e("/community", "community", "community", "Community", "What is happening on REEEETAKES.", { keywords: "home news" }),
  e("/feed", "community", "feed", "Feed", "Posts, highlights and discussions.", { keywords: "posts news social" }),
  e("/safe-place", "community", "safe_place", "Safe Place", "A queue for players with a good teamplay and conduct score.", { keywords: "friendly queue conduct toxicity" }),
  e("/orgs", "community", "orgs", "Organizations", "Organizations that run events here.", { keywords: "organisers clubs" }),
  e("/request-skin", "community", "request_skin", "Request a skin", "Ask for a skin that is missing from the catalog.", { keywords: "missing item" }),

  // resources
  e("/economy", "resources", "economy", "Economy", "Money, round types, utility limits and what the allocator buys you.", { keywords: "money buy rounds allocator" }),
  e("/commands", "resources", "commands", "Commands", "Every chat and console command the servers answer to, by mode.", { keywords: "chat console help !" }),
  e("/roadmap", "resources", "roadmap", "Roadmap", "What is built, what is next.", { keywords: "changelog plans todo" }),

  // account
  e("/profile", "account", "profile", "Profile", "Your page as others see it.", { auth: true, index: false }),
  e("/settings", "account", "settings", "Settings", "Name, language, integrations and privacy.", { auth: true, index: false }),
  e("/loadout", "account", "loadout", "Loadout picker", "Choose which loadout you play with.", { auth: true, index: false }),
  e("/clips", "account", "clips", "My clips", "Rounds you marked with /clip in game.", { keywords: "highlights video clip", auth: true, index: false }),
];

/**
 * The pages a demo shows. An allowlist, so a new page stays out of a demo until
 * somebody decides otherwise — see the long note in NavBar. Shared with the
 * command palette, which in a demo offers these and nothing else.
 */
export const DEMO_ALLOWLIST = ["/tournaments", "/stats", "/lobby"];

/** The site map without account pages, grouped — what the footer draws. */
export function groupedSiteMap(): { group: (typeof SITE_GROUPS)[number]; entries: SiteEntry[] }[] {
  return SITE_GROUPS.filter((g) => g.id !== "account").map((group) => ({
    group,
    entries: SITE_MAP.filter((entry) => entry.group === group.id),
  }));
}

/**
 * Score one entry against a query, 0 meaning no match.
 *
 * Deliberately simple: prefix of the label beats a word in the label beats a
 * keyword beats the description. Fuzzy libraries rank "st" to "Safe Place"
 * above "Stats", which is exactly backwards for a nav.
 */
export function scoreEntry(entry: { label: string; desc: string; keywords?: string; href: string }, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const label = entry.label.toLowerCase();
  if (label.startsWith(q)) return 100 - label.length / 100;
  if (label.split(/\s+/).some((w) => w.startsWith(q))) return 80;
  if (label.includes(q)) return 60;
  if ((entry.keywords ?? "").toLowerCase().split(/\s+/).some((w) => w.startsWith(q))) return 45;
  if (entry.href.toLowerCase().includes(q)) return 30;
  if (entry.desc.toLowerCase().includes(q)) return 20;
  return 0;
}
