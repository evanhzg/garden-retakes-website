/**
 * The homepage's tower round (lib/tournament/towerRound.ts).
 *
 * The figure claims to be a real round, so what is checked is that it plays by the
 * plugin's rules on every spot of every zone, not that it looks right:
 *
 *   - the clock: towards 2:00 while the tower is dormant; 20 s from every activation
 *     (a takeover starts them again); the final 20 s after 2:00, ending in a draw when
 *     nobody ever activated it;
 *   - the race: whoever finishes running AND holding E first takes it, with the
 *     Engineer's 1.5 s against everybody else's 3;
 *   - a respawn: 5 s after going down, from the classic spawn, and it only takes the
 *     tower back inside the 20 s;
 *   - the map data: every zone has its spots, spawns and routes, the bomb sites and the
 *     field spots are both there, every role on the role card has spawns to show.
 */
import {
  ACTIVATE_SECONDS,
  COUNTDOWN_SECONDS,
  ENGINEER_SECONDS,
  FINAL_AFTER,
  RESPAWN_SECONDS,
  SCENARIOS,
  TOWER_MAPS,
  actorAt,
  clockAt,
  formatClock,
  needFor,
  ownerAt,
  pointAlong,
  polyline,
  routeOf,
  scenario,
} from "@/lib/tournament/towerRound";

let fails = 0;
let checks = 0;
const check = (n: string, c: boolean, extra = "") => {
  checks++;
  if (!c) {
    console.log("FAIL " + n + "  " + extra);
    fails++;
  }
};

const map = TOWER_MAPS.de_dust2;

check("the plugin's numbers", FINAL_AFTER === 120 && ACTIVATE_SECONDS === 3 && ENGINEER_SECONDS === 1.5 && COUNTDOWN_SECONDS === 20 && RESPAWN_SECONDS === 5);
check("the Engineer is twice as fast", needFor("engineer") === 1.5 && needFor("rifler") === 3 && needFor(null) === 3);
check("clock format", formatClock(120) === "2:00" && formatClock(20) === "0:20" && formatClock(4.2) === "0:05" && formatClock(0) === "0:00");

check("both bomb sites", map.zones.filter((z) => z.kind === "site").map((z) => z.name).join() === "A Site,B Site");
check("field spots too", map.zones.some((z) => z.kind === "field"));
check("the classic spawns", !!map.bases.t && !!map.bases.ct && map.bases.t.name.length > 0);

const [bx, by, bw, bh] = map.bounds;
const inMap = (p: { x: number; y: number }) => p.x >= bx && p.x <= bx + bw && p.y >= by && p.y <= by + bh;

for (const [zi, zone] of map.zones.entries()) {
  const all = [...zone.spots, ...zone.t, ...zone.ct, ...zone.roamer];
  check(`${zone.name}: everything on the map`, all.every(inMap));
  check(`${zone.name}: six T, six CT`, zone.t.length === 6 && zone.ct.length === 6);
  check(`${zone.name}: an Engineer among the Ts`, zone.t.some((p) => p.role === "engineer"));
  check(`${zone.name}: a route from every spawn to every spot`, zone.routes.length === zone.spots.length &&
    zone.routes.every((r) => r.t.length === zone.t.length && r.ct.length === zone.ct.length && r.roamer.length === zone.roamer.length));

  for (const [spot, name] of zone.spots.map((p, i) => [i, p.name] as const)) {
    const where = `${zone.name} ${name}`;
    const routes = zone.routes[spot];
    const runs = [...routes.t, ...routes.ct, ...routes.roamer];
    check(`${where}: routes take between 1 and 15 s`, runs.every((r) => r.secs > 1 && r.secs < 15), runs.map((r) => r.secs).join(","));
    check(`${where}: respawn routes are real runs`, routes.respawn.t.secs > 1 && routes.respawn.ct.secs > 1);
    const tower = zone.spots[spot];
    for (const r of [routes.t[0], routes.respawn.ct]) {
      const end = pointAlong(polyline(r.d), 1);
      check(`${where}: a route ends at the tower`, Math.hypot(end[0] - tower.x, end[1] - tower.y) < 0.5);
    }

    for (const id of SCENARIOS) {
      const s = scenario(map, zi, spot, id);
      const tag = `${where} / ${id}`;
      check(`${tag}: 2:00 at freeze end`, clockAt(s, 0) === FINAL_AFTER);
      const times = s.captures.map((c) => c.at);
      check(`${tag}: captures in order`, times.every((t, i) => i === 0 || t >= times[i - 1]));
      check(`${tag}: ends after the last capture`, s.end >= (times.at(-1) ?? 0));
      for (const [ai, a] of s.actors.entries()) {
        check(`${tag}: runs start before they arrive`, a.start <= a.arrive);
        for (const h of a.holds) {
          check(`${tag}: ${a.role} holds after arriving`, h.from >= a.arrive - 1e-9);
          if (h.done) check(`${tag}: ${a.role}'s completed hold lasts its time`, Math.abs(h.to - h.from - needFor(a.role)) < 0.11, `${h.from}-${h.to}`);
        }
        // Two players at the tower stand either side of it, not on one pixel.
        const line = polyline(routeOf(zone, spot, a).d);
        const [x, y] = actorAt(line, a, s.end, 8);
        if (a.holds.length) check(`${tag}: actor ${ai} stops short of the tower`, Math.hypot(x - tower.x, y - tower.y) > 3);
      }

      if (id === "standoff") {
        check(`${tag}: the final 20 s start at 2:00`, clockAt(s, FINAL_AFTER) === COUNTDOWN_SECONDS);
        check(`${tag}: nobody holds it, a draw at 2:20`, ownerAt(s, s.end) === null && clockAt(s, s.end) === 0 && s.end === 140);
        continue;
      }

      const first = s.captures[0];
      check(`${tag}: 0:20 at an activation`, Math.abs(clockAt(s, first.at) - COUNTDOWN_SECONDS) < 1e-9);
      // Down from there until the next activation (which starts it again).
      const gap = Math.min(5, ((s.captures[1]?.at ?? Infinity) - first.at) * 0.9);
      check(`${tag}: the clock runs down from there`, Math.abs(clockAt(s, first.at + gap) - (COUNTDOWN_SECONDS - gap)) < 1e-9);
      const last = s.captures.at(-1)!;
      check(`${tag}: every activation resets`, Math.abs(clockAt(s, last.at) - COUNTDOWN_SECONDS) < 1e-9);

      if (id === "race") {
        const [win, lose] = s.actors;
        const wDone = win.arrive + needFor(win.role);
        const lDone = lose.arrive + needFor(lose.role);
        check(`${tag}: the winner finished first`, wDone <= lDone + 1e-9 && first.side === win.side, `${wDone} vs ${lDone}`);
        check(`${tag}: one activation`, s.captures.length === 1);
      }
      if (id === "takeover") {
        check(`${tag}: flips once`, s.captures.length === 2 && last.side !== first.side);
      }
      if (id === "respawn") {
        const down = s.actors.find((a) => a.out !== undefined)!;
        const again = s.actors.find((a) => a.group === "respawn")!;
        check(`${tag}: back 5 s after going down`, Math.abs(again.start - (down.out! + RESPAWN_SECONDS)) < 0.11);
        check(`${tag}: from the classic spawn`, again.from === map.bases[again.side].name);
        if (s.captures.length === 2) {
          check(`${tag}: took it back inside the 20 s`, last.at - first.at < COUNTDOWN_SECONDS && last.side === again.side);
        } else {
          check(`${tag}: too late ends at the countdown`, Math.abs(s.end - (first.at + COUNTDOWN_SECONDS)) < 0.11);
        }
      }
      if (id === "roamer" && zone.roamer.length) {
        check(`${tag}: the Roamer ends with it`, last.side === "ct");
        check(`${tag}: inside the 20 s`, last.at - first.at < COUNTDOWN_SECONDS);
      }
    }
  }
}

// Every role on the homepage's role card has spawns on the map to point at.
const roles = new Set(map.zones.flatMap((z) => [...z.t, ...z.ct, ...z.roamer].map((p) => p.role)));
for (const r of ["frontrunner", "awper", "backup", "roamer", "rifler", "engineer", "burner", "sniper"]) {
  check(`role ${r} has spawns on the map`, roles.has(r));
}

console.log(fails ? `\n${fails} of ${checks} failed` : `all ${checks} passed`);
if (fails) process.exit(1);
