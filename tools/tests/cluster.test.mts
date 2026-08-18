import { clusterByStand, displayLineupName, STAND_CLUSTER_RADIUS } from "@/lib/utilityShared";

let id = 0;
const L = (x: number, y: number, opts: Partial<any> = {}): any => ({
  id: ++id, map: "de_mirage", name: opts.name ?? `T smoke (${x}, ${y})`,
  area: opts.area ?? "", utility: opts.utility ?? "smoke", purpose: "execute",
  team: "T", throwType: "jump", clickType: "left",
  stand: { x, y, z: 0 }, view: { pitch: 0, yaw: 0 }, land: null,
  notes: null, clipUrl: null, thumb: null,
  shots: { stand: null, aim: null, result: null },
  verified: true, source: "import", popularity: opts.popularity ?? 1,
  ...opts,
});

let fails = 0;
const check = (name: string, cond: boolean, extra = "") => {
  console.log((cond ? "ok   " : "FAIL ") + name + (cond ? "" : "  " + extra));
  if (!cond) fails++;
};

// The reported bug: many throws from one corner, each its own group before.
const sameCorner = [L(100, 100), L(110, 105), L(95, 92), L(120, 118)];
let c = clusterByStand(sameCorner);
check("four throws from one corner are one group", c.length === 1, `got ${c.length}`);
check("the group keeps all four", c[0].list.length === 4);

// Genuinely different spots stay apart.
c = clusterByStand([L(0, 0), L(1000, 0), L(0, 1000)]);
check("three distant spots are three groups", c.length === 3, `got ${c.length}`);

// Just inside / just outside the radius.
c = clusterByStand([L(0, 0), L(STAND_CLUSTER_RADIUS - 1, 0)]);
check("just inside the radius merges", c.length === 1, `got ${c.length}`);
c = clusterByStand([L(0, 0), L(STAND_CLUSTER_RADIUS + 40, 0)]);
check("well outside the radius does not", c.length === 2, `got ${c.length}`);

// A named lineup lends its callout to the mined ones beside it — the exact
// "common spawns shown as different" case.
c = clusterByStand([
  L(200, 200, { area: "A Ramp", name: "A Ramp to CT Smoke" }),
  L(210, 195),
  L(190, 205),
]);
check("a cluster takes the callout it has", c.length === 1 && c[0].area === "A Ramp", JSON.stringify(c.map(x => x.area)));

// Nearby unnamed cluster borrows a "near" hint, distant one does not.
c = clusterByStand([L(0, 0, { area: "Long", name: "Long to A Smoke" }), L(300, 0), L(9000, 0)]);
const near = c.find(x => Math.round(x.stand.x) === 300)!;
const far = c.find(x => Math.round(x.stand.x) === 9000)!;
check("a nearby unnamed cluster says 'near Long'", near.nearArea === "Long", near.nearArea);
check("a distant one claims nothing", far.nearArea === "", far.nearArea);

// Ordering is by popularity, and stable across input order.
const a = clusterByStand([L(0, 0, { popularity: 2 }), L(5000, 0, { popularity: 11 })]);
const b = clusterByStand([L(5000, 0, { popularity: 11 }), L(0, 0, { popularity: 2 })]);
check("busiest spot first", a[0].peak === 11);
check("order does not depend on input order", JSON.stringify(a.map(x => x.key)) === JSON.stringify(b.map(x => x.key)));

// Display names.
check("coordinate name becomes readable", displayLineupName(L(1, 2, { name: "T smoke (-1234, 567)" })) === "T smoke");
check("a real name is left alone", displayLineupName(L(1, 2, { name: "A Ramp to CT Smoke" })) === "A Ramp to CT Smoke");
check("an all-coordinate name keeps something", displayLineupName(L(1, 2, { name: "(1, 2)" })) === "(1, 2)");

check("empty input is empty output", clusterByStand([]).length === 0);

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
