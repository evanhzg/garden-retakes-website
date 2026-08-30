/**
 * Map names and the stored exclusion list.
 *
 * `mapName` is here because of the way it failed. It took `string`, and a
 * caller handed it the null the lobby socket sends for a match with no map
 * decided yet — every bot match — which threw inside a render and took the
 * whole matchmaking page down with a "Cannot read properties of null". A label
 * helper called from a dozen render paths cannot be the thing that enforces
 * "there is always a map".
 */
import { MAP_LABELS, mapName, sanitiseExcludedMaps } from "@/lib/maps";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};

// ------------------------------------------------------------------- naming

check("a known map gets its proper name", mapName("de_dust2") === "Dust II", mapName("de_dust2"));
check("an unknown one loses its prefix", mapName("de_cbble") === "cbble", mapName("de_cbble"));
check("a name without a prefix is left alone", mapName("workshop_thing") === "workshop_thing");

// The regression. Each of these reached the helper from a real render path.
check("null is empty rather than a crash", mapName(null) === "");
check("undefined is empty too", mapName(undefined) === "");
check("an empty string stays empty", mapName("") === "");

check(
  "every label is a real name rather than an id",
  Object.values(MAP_LABELS).every((label) => !label.startsWith("de_")),
);

// ---------------------------------------------------------------- exclusions

check("nonsense excludes nothing", sanitiseExcludedMaps("de_dust2").length === 0);
check("null excludes nothing", sanitiseExcludedMaps(null).length === 0);
check(
  "a map that has left the pool is dropped",
  !sanitiseExcludedMaps(["de_dust2", "de_cbble"]).includes("de_cbble" as never),
);
check("a map still in the pool is kept", sanitiseExcludedMaps(["de_dust2"]).includes("de_dust2" as never));

console.log(fails ? `\n${fails} FAILED` : "\nall good");
process.exit(fails ? 1 : 0);
