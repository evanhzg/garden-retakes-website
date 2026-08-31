/**
 * Who can read the other team's chat. (Nobody.)
 *
 * The room panel gained a private per-team channel, and the whole value of one
 * is that the other side cannot read it — a team discussing which map to ban is
 * saying exactly the thing that is worth least once it leaks. The filtering
 * happens in the query rather than the component, so these are the assertions
 * that stand between a veto plan and the opponent's screen.
 */
import {
  readableScopes,
  mayPostTo,
  parseScope,
  isScope,
} from "@/lib/tournament/roomScope";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};

// ---- reading --------------------------------------------------------------

check("a spectator sees only the room", JSON.stringify(readableScopes(null)) === '["room"]');
check("team A sees the room and their own", JSON.stringify(readableScopes("a")) === '["room","a"]');
check("team B sees the room and their own", JSON.stringify(readableScopes("b")) === '["room","b"]');

check("team A never gets team B's scope", !readableScopes("a").includes("b"));
check("team B never gets team A's scope", !readableScopes("b").includes("a"));
check("a spectator gets neither team's scope", readableScopes(null).length === 1);

// ---- writing --------------------------------------------------------------

check("a player may talk to the room", mayPostTo("a", "room", true));
check("a spectator may talk to the room", mayPostTo(null, "room", true));
check("a player may talk to their own team", mayPostTo("a", "a", true));
check("a player may NOT talk to the other team", !mayPostTo("a", "b", true));
check("a spectator may not talk to either team", !mayPostTo(null, "a", true) && !mayPostTo(null, "b", true));

check("signed out cannot post to the room", !mayPostTo("a", "room", false));
check("signed out cannot post to a team", !mayPostTo("a", "a", false));

// ---- parsing --------------------------------------------------------------

const missing = parseScope(undefined);
check("a request with no scope means the room", missing.ok === true && missing.scope === "room");
check("an empty scope means the room", (() => { const r = parseScope(""); return r.ok && r.scope === "room"; })());
check("null means the room", (() => { const r = parseScope(null); return r.ok && r.scope === "room"; })());

for (const s of ["room", "a", "b"]) {
  const r = parseScope(s);
  check(`"${s}" parses to itself`, r.ok === true && r.scope === s);
}

// Not widened to "room": a caller sending something wrong is a bug, and
// quietly making a line public is the wrong way to recover from it.
for (const bad of ["A", "admin", "team", "all", 1, true, {}, []]) {
  check(`${JSON.stringify(bad)} is refused, not defaulted`, parseScope(bad).ok === false);
}

check("isScope accepts the three", ["room", "a", "b"].every(isScope));
check("isScope rejects a role that is not a scope", !isScope("admin"));

console.log(fails === 0 ? "\nroomScope: all good" : `\nroomScope: ${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
