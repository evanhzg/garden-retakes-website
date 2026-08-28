/**
 * Turning a lobby into a match.
 *
 * The rule worth most of these tests is the one that spans both rosters: a
 * player on two teams produces a scoreboard with the same person twice and
 * stats that cannot be attributed, so it is refused rather than warned about.
 */
import {
  PICKUP_SIZES,
  isPickupSize,
  pickupMatchKey,
  pickupName,
  pickupSlug,
  pickupTeamName,
  validatePickup,
} from "@/lib/tournament/pickup";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};

const id = (n: number) => `765611980000000${String(n).padStart(2, "0")}`;
const team = (...ns: number[]) => ({ players: ns.map(id) });

// ------------------------------------------------------------------- the sizes

check("2v2 and 3v3 are the supported sizes", PICKUP_SIZES.join(",") === "2,3");
check("2 is a size", isPickupSize(2));
check("3 is a size", isPickupSize(3));
check("1v1 is not", !isPickupSize(1));
check("5v5 is not — these are retakes servers", !isPickupSize(5));

check("each size gets its own tournament", pickupSlug(2) !== pickupSlug(3));
check("slug shape", pickupSlug(3) === "pickup-3v3", pickupSlug(3));
check("name shape", pickupName(2) === "Pickup 2v2", pickupName(2));

// ------------------------------------------------------------- 2v2 and 3v3 both

{
  const v = validatePickup(2, team(1, 2), team(3, 4));
  check("a full 2v2 is accepted", v.ok, JSON.stringify(v));
}

{
  const v = validatePickup(3, team(1, 2, 3), team(4, 5, 6));
  check("a full 3v3 is accepted", v.ok, JSON.stringify(v));
}

{
  const v = validatePickup(3, team(1, 2), team(4, 5, 6));
  check("a short team is refused", !v.ok);
  check("...and says which side and by how much", !v.ok && v.error.includes("Team A has 2"), !v.ok ? v.error : "");
}

{
  const v = validatePickup(2, team(1, 2, 3), team(4, 5));
  check("an over-full team is refused", !v.ok, JSON.stringify(v));
}

{
  const v = validatePickup(4, team(1, 2, 3, 4), team(5, 6, 7, 8));
  check("4v4 is refused even though the rosters are consistent", !v.ok);
  check("...because the servers will not run it", !v.ok && v.error.includes("not a size"), !v.ok ? v.error : "");
}

// ------------------------------------------------------- the rule that matters

{
  const v = validatePickup(2, { players: [id(1), id(2)] }, { players: [id(2), id(3)] });
  check("a player on both teams is refused", !v.ok);
  check("...and says so plainly", !v.ok && v.error.includes("both teams"), !v.ok ? v.error : "");
}

{
  const v = validatePickup(2, { players: [id(1), id(1)] }, team(3, 4));
  check("the same player twice on ONE team is refused", !v.ok, JSON.stringify(v));
}

{
  // Whitespace must not smuggle a duplicate past the check.
  const v = validatePickup(2, { players: [id(1), id(2)] }, { players: [` ${id(2)} `, id(3)] });
  check("a padded id is still the same player", !v.ok, JSON.stringify(v));
}

{
  const v = validatePickup(2, { players: ["not-an-id", id(2)] }, team(3, 4));
  check("a malformed id is refused", !v.ok);
}

{
  const v = validatePickup(2, { players: ["10358279000000000", id(2)] }, team(3, 4));
  check("a group id is refused", !v.ok, JSON.stringify(v));
}

// ------------------------------------------------------------------ team names

check(
  "a given name wins",
  pickupTeamName({ players: [], name: "Sunrise" }, "oasey", "Team A") === "Sunrise",
);
check(
  "otherwise the captain names the team",
  pickupTeamName({ players: [] }, "oasey", "Team A") === "oasey's team",
);
check(
  "a nameless captain falls back",
  pickupTeamName({ players: [] }, null, "Team A") === "Team A",
);
check(
  "a blank given name falls through rather than winning",
  pickupTeamName({ players: [], name: "   " }, "oasey", "Team A") === "oasey's team",
);
{
  // A long Steam name would truncate mid-possessive, which reads as a bug.
  const long = "x".repeat(40);
  check("a very long captain name falls back instead of truncating", pickupTeamName({ players: [] }, long, "Team A") === "Team A");
}
{
  const name = pickupTeamName({ players: [], name: "y".repeat(200) }, null, "Team A");
  check("a given name is capped to the column", name.length <= 64, String(name.length));
}

// ------------------------------------------------------------------- match key

check("the key names the match, not the lobby", pickupMatchKey(41) === "pu41");
check("two matches never share a key", pickupMatchKey(41) !== pickupMatchKey(42));

console.log(fails ? `\n${fails} FAILED` : "\nall good");
process.exit(fails ? 1 : 0);
