/**
 * Choosing what leads the feed.
 *
 * The formula is the profile page's (likes*3 + comments) plus a decay the feed
 * needs and that page did not: without it the most-liked clip of all time holds
 * the hero seat for ever, and a hero that never changes stops being looked at.
 */
import { clipScore, pickHero, clipVariants, HERO_HALF_LIFE_DAYS } from "@/lib/feedShared";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};

const NOW = Date.UTC(2026, 0, 20);
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const clip = (id: number, likes: number, comments: number, age: number) =>
  ({ id, likes, comments, createdAt: daysAgo(age) });

// --- the formula ------------------------------------------------------------
check("likes are worth more than comments",
  clipScore(clip(1, 1, 0, 0), NOW) > clipScore(clip(2, 0, 1, 0), NOW));
check("a like is worth three comments exactly",
  clipScore(clip(1, 1, 0, 0), NOW) === clipScore(clip(2, 0, 3, 0), NOW));
check("no reaction scores zero", clipScore(clip(1, 0, 0, 0), NOW) === 0);

// --- the decay --------------------------------------------------------------
const fresh = clipScore(clip(1, 10, 0, 0), NOW);
const halfLife = clipScore(clip(2, 10, 0, HERO_HALF_LIFE_DAYS), NOW);
check("a clip halves in value over the half-life", Math.abs(halfLife - fresh / 2) < 1e-9,
  `${fresh} -> ${halfLife}`);
check("an old clip loses to a fresher one with fewer likes",
  clipScore(clip(1, 4, 0, 0), NOW) > clipScore(clip(2, 10, 0, 30), NOW));
check("but a much better old clip still wins",
  clipScore(clip(1, 200, 0, 12), NOW) > clipScore(clip(2, 3, 0, 0), NOW));
check("a future-dated clip does not get a bonus",
  clipScore(clip(1, 5, 0, -100), NOW) === clipScore(clip(2, 5, 0, 0), NOW));

// --- picking ----------------------------------------------------------------
const set = [clip(1, 2, 0, 0), clip(2, 50, 3, 1), clip(3, 8, 1, 0), clip(4, 1, 0, 0),
             clip(5, 4, 0, 2), clip(6, 3, 0, 1), clip(7, 9, 0, 40)];
const hero = pickHero(set, 4, NOW)!;
check("the best clip leads", hero.featured.id === 2, String(hero.featured.id));
check("four runners-up", hero.rest.length === 4, String(hero.rest.length));
check("the lead is not repeated below it", !hero.rest.some((c) => c.id === hero.featured.id));
check("runners-up are in order", (() => {
  const s = hero.rest.map((c) => clipScore(c, NOW));
  return s.every((v, i) => i === 0 || s[i - 1] >= v);
})(), JSON.stringify(hero.rest.map((c) => c.id)));

check("clips with no reaction are never promoted",
  pickHero([clip(1, 0, 0, 0), clip(2, 0, 0, 1)], 4, NOW) === null);
check("an empty feed has no hero", pickHero([], 4, NOW) === null);
check("one good clip is a hero with no runners-up", (() => {
  const h = pickHero([clip(1, 5, 0, 0), clip(2, 0, 0, 0)], 4, NOW);
  return h !== null && h.featured.id === 1 && h.rest.length === 0;
})());
check("fewer clips than asked for is fine",
  pickHero([clip(1, 5, 0, 0), clip(2, 4, 0, 0)], 4, NOW)!.rest.length === 1);

// --- the shared variant helper ----------------------------------------------
// Three client components had each inlined this and the copies had drifted:
// the profile card did not know about "allstar", so those clips rendered with
// no playable source at all.
const json = JSON.stringify([{ name: "1080p", height: 1080, url: "https://x/a.mp4" }]);
check("stored renditions win", clipVariants("r2", "https://x/b.mp4", json)[0].height === 1080);
check("bad JSON falls back to the single source",
  clipVariants("r2", "https://x/b.mp4", "{not json")[0].url === "https://x/b.mp4");
check("an empty array falls back too",
  clipVariants("r2", "https://x/b.mp4", "[]")[0].url === "https://x/b.mp4");
check("r2 is a direct url", clipVariants("r2", "https://x/c.mp4", null)[0].url === "https://x/c.mp4");
check("ALLSTAR is a direct url (the drift)",
  clipVariants("allstar", "https://a/c.mp4", null)[0].url === "https://a/c.mp4",
  JSON.stringify(clipVariants("allstar", "https://a/c.mp4", null)));
check("upload goes through the video route",
  clipVariants("upload", "my clip.mp4", null)[0].url === "/api/feed/video/my%20clip.mp4",
  clipVariants("upload", "my clip.mp4", null)[0]?.url);
check("youtube has no direct source", clipVariants("youtube", "abc12345678", null).length === 0);
check("an unknown kind has none either", clipVariants("wat", "x", null).length === 0);
check("the source label is used", clipVariants("r2", "u", null, "Original")[0].name === "Original");

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
