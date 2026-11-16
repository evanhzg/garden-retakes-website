/**
 * The homepage's tower round (lib/tournament/towerRound.ts).
 *
 * The figure claims to be a real round, so what is checked is that it plays by
 * the plugin's rules on every spot of both sites, not that it looks right:
 *
 *   - the clock: 1:15 until the first activation, then 20 s that a takeover
 *     never adds to, and 0:00 at the end of a stand-off with nobody owning it;
 *   - the race: whoever finishes running AND holding E first takes it, with the
 *     Engineer's 1.5 s against everybody else's 3;
 *   - the takeover flips the owner inside the 20 s;
 *   - the map data: every spawn, tower spot and route is inside its site's view,
 *     every role on the role card has spawns to show, and routes take time.
 */
import {
  ACTIVATE_SECONDS,
  ENGINEER_SECONDS,
  FINAL_SECONDS,
  ROUND_SECONDS,
  SCENARIOS,
  TOWER_MAPS,
  clockAt,
  formatClock,
  needFor,
  ownerAt,
  pointAlong,
  polyline,
  scenario,
} from "@/lib/tournament/towerRound";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};

const map = TOWER_MAPS.de_dust2;

check("the plugin's numbers", ROUND_SECONDS === 75 && ACTIVATE_SECONDS === 3 && ENGINEER_SECONDS === 1.5 && FINAL_SECONDS === 20);
check("the Engineer is twice as fast", needFor("engineer") === 1.5 && needFor("rifler") === 3 && needFor(null) === 3);
check("clock format", formatClock(75) === "1:15" && formatClock(20) === "0:20" && formatClock(4.2) === "0:05" && formatClock(0) === "0:00");

check("two sites", map.sites.map((s) => s.site).join("") === "AB");

for (const [si, site] of map.sites.entries()) {
  const [vx, vy, vw, vh] = site.view;
  const inside = (p: { x: number; y: number }) => p.x >= vx && p.x <= vx + vw && p.y >= vy && p.y <= vy + vh;
  const all = [...site.spots, ...site.t, ...site.ct, ...site.roamer];
  check(`${site.site}: every spawn and spot in the view`, all.every(inside));
  check(`${site.site}: six T, six CT, some Roamer spawns`, site.t.length === 6 && site.ct.length === 6 && site.roamer.length > 0);
  check(`${site.site}: an Engineer among the Ts`, site.t.some((p) => p.role === "engineer"));
  check(`${site.site}: a route from every spawn to every spot`, site.routes.length === site.spots.length &&
    site.routes.every((r) => r.t.length === site.t.length && r.ct.length === site.ct.length && r.roamer.length === site.roamer.length));

  for (const [spot, name] of site.spots.map((p, i) => [i, p.name] as const)) {
    const where = `${site.site} ${name}`;
    const routes = site.routes[spot];
    const runs = [...routes.t, ...routes.ct, ...routes.roamer];
    check(`${where}: routes take between 1 and 15 s`, runs.every((r) => r.secs > 1 && r.secs < 15), runs.map((r) => r.secs).join(","));
    const line = polyline(routes.t[0].d);
    const end = pointAlong(line, 1);
    const tower = site.spots[spot];
    check(`${where}: a route ends at the tower`, Math.hypot(end[0] - tower.x, end[1] - tower.y) < 0.5);

    for (const id of SCENARIOS) {
      const s = scenario(map, si, spot, id);
      const tag = `${where} / ${id}`;
      check(`${tag}: 1:15 at freeze end`, clockAt(s, 0) === ROUND_SECONDS);
      const times = s.captures.map((c) => c.at);
      check(`${tag}: captures in order`, times.every((t, i) => i === 0 || t >= times[i - 1]));
      check(`${tag}: ends after the last capture`, s.end >= (times.at(-1) ?? 0));

      if (id === "standoff") {
        check(`${tag}: nobody holds it, 0:00`, ownerAt(s, s.end) === null && clockAt(s, s.end) === 0);
        continue;
      }
      const first = s.captures[0];
      check(`${tag}: 0:20 at the first activation`, Math.abs(clockAt(s, first.at) - FINAL_SECONDS) < 1e-9);
      check(`${tag}: the clock runs down from there`, Math.abs(clockAt(s, first.at + 5) - (FINAL_SECONDS - 5)) < 1e-9);
      for (const a of s.actors) {
        for (const h of a.holds) {
          check(`${tag}: ${a.role} holds after arriving`, h.from >= a.arrive - 1e-9);
          if (h.done) check(`${tag}: ${a.role}'s completed hold lasts its time`, Math.abs(h.to - h.from - needFor(a.role)) < 0.11, `${h.from}-${h.to}`);
        }
      }

      if (id === "race") {
        const [win, lose] = s.actors;
        const wDone = win.arrive + needFor(win.role);
        const lDone = lose.arrive + needFor(lose.role);
        check(`${tag}: the winner finished first`, wDone <= lDone + 1e-9 && first.side === win.side, `${wDone} vs ${lDone}`);
        check(`${tag}: one activation`, s.captures.length === 1);
      }
      if (id === "takeover" || id === "roamer") {
        const last = s.captures.at(-1)!;
        check(`${tag}: ends with the CTs or a flip`, s.captures.length >= 1 && (id === "roamer" ? last.side === "ct" : last.side !== first.side));
        check(`${tag}: inside the 20 s`, last.at - first.at < FINAL_SECONDS);
        check(`${tag}: a takeover does not add time`, Math.abs(clockAt(s, last.at) - (FINAL_SECONDS - (last.at - first.at))) < 1e-9);
      }
    }
  }
}

// Every role on the homepage's role card has spawns on the map to point at.
const roles = new Set(map.sites.flatMap((s) => [...s.t, ...s.ct, ...s.roamer].map((p) => p.role)));
for (const r of ["frontrunner", "awper", "backup", "roamer", "rifler", "engineer", "burner", "sniper"]) {
  check(`role ${r} has spawns on the map`, roles.has(r));
}

console.log(fails ? `\n${fails} failed` : "\nall passed");
if (fails) process.exit(1);
