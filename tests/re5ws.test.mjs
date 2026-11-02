// node --test tests/re5ws.test.mjs — the in-game RE5WS Manager's rules (lib/re5ws.ts).
// Compiles lib/re5ws.ts (and lib/inventory.ts, its only import) to CommonJS in a temp dir first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = mkdtempSync(join(tmpdir(), "re5ws-"));
execFileSync("node_modules/.bin/tsc", ["lib/re5ws.ts", "--outDir", out, "--module", "commonjs", "--target", "es2020",
  "--skipLibCheck", "--esModuleInterop"], { stdio: "inherit" });
const R = createRequire(import.meta.url)(join(out, "re5ws.js"));
const INV = createRequire(import.meta.url)(join(out, "inventory.js"));

const ids = { agentDef: (v) => v + 1000, musicKitDef: (v) => v - 100 };
const item = (over) => ({ id: over.id, uid: 1, kind: "weapon", weaponDef: 7, weaponName: "AK-47", team: "both", skinId: 1,
  skinName: "AK-47 | Redline", paint: 282, image: "", rarity: "#d32ce6", wear: 0.2, seed: 1, statTrak: false, nameTag: "",
  stickers: [null, null, null, null, null], createdAt: 0, ...over });

function store() {
  const a = INV.emptyLoadout("Main"), b = INV.emptyLoadout("Other");
  const items = [
    item({ id: "ak" }),
    item({ id: "awp", weaponDef: 9, skinName: "AWP | Asiimov", paint: 279, rarity: "#eb4b4b", statTrak: true }),
    item({ id: "karambit", kind: "knife", weaponDef: 507, skinName: "★ Karambit | Doppler", paint: 418 }),
    item({ id: "agentT", kind: "agent", weaponDef: 50, team: "t", skinName: "Sir Bloody Darryl", paint: 0 }),
    item({ id: "patch", kind: "patch", weaponDef: 4, skinName: "Patch" }),
  ];
  a.equippedT["7"] = "ak";
  a.knifeCT = "karambit";
  return { items, loadouts: [a, b], activeLoadoutId: a.id, nextUid: 10 };
}

test("state: indices, game defs, sides, patches left out", () => {
  const s = store();
  const st = R.stateOf(s, ids);
  assert.equal(st.items.length, 4);
  assert.deepEqual(st.items[0], { id: "ak", k: "w", d: 7, p: 282, n: "AK-47 | Redline", r: 4, f: 0.2, s: false, t: "" });
  assert.equal(st.items[3].d, 1050, "agents go out as game defs");
  assert.equal(st.items[3].t, "t");
  assert.equal(st.items[3].f, -1);
  assert.deepEqual(st.loadouts[0].T, { 7: 0 });
  assert.deepEqual(st.loadouts[0].C, { knife: 2 });
  assert.equal(st.loadouts[0].a, true);
  assert.equal(st.loadouts[0].c, 0);
});

test("equip: only what fits the slot and side; null clears", () => {
  const s = store(), lo = s.loadouts[1].id;
  assert.equal(R.applyOp(s, { op: "equip", loadoutId: lo, side: "ct", slot: "9", itemId: "awp" }, () => undefined).ok, true);
  assert.equal(s.loadouts[1].equippedCT["9"], "awp");
  const wrong = R.applyOp(s, { op: "equip", loadoutId: lo, side: "t", slot: "7", itemId: "awp" }, () => undefined);
  assert.equal(wrong.ok, false);
  assert.equal(R.applyOp(s, { op: "equip", loadoutId: lo, side: "ct", slot: "agent", itemId: "agentT" }, () => undefined).ok, false,
    "a T agent does not go on CT");
  const r = R.applyOp(s, { op: "equip", loadoutId: s.loadouts[0].id, side: "t", slot: "7", itemId: null }, () => undefined);
  assert.equal(r.ok, true);
  assert.equal(r.affectsGame, true, "the loadout in use changed");
  assert.equal(s.loadouts[0].equippedT["7"], undefined);
});

test("equipNew adds the catalog skin once and equips it", () => {
  const s = store(), lo = s.loadouts[0].id;
  const pick = { kind: "weapon", weaponDef: 16, weaponName: "M4A4", team: "both", skinId: 999, skinName: "M4A4 | Howl",
    paint: 309, image: "x", rarity: "#e4ae39", wearMin: 0.05 };
  const cat = (id) => (id === 999 ? pick : undefined);
  const r = R.applyOp(s, { op: "equipNew", loadoutId: lo, side: "ct", slot: "16", catalogId: 999 }, cat);
  assert.equal(r.ok, true);
  assert.equal(s.items[0].skinName, "M4A4 | Howl");
  assert.equal(s.items[0].wear, 0.05);
  assert.equal(s.items[0].uid, 10);
  assert.equal(s.nextUid, 11);
  assert.equal(s.loadouts[0].equippedCT["16"], s.items[0].id);
  assert.equal(s.loadouts[0].preferredM4, 16);
  R.applyOp(s, { op: "equipNew", loadoutId: s.loadouts[1].id, side: "ct", slot: "16", catalogId: 999 }, cat);
  assert.equal(s.items.filter((i) => i.skinId === 999).length, 1, "identical item reused");
  const before = s.items.length;
  assert.equal(R.applyOp(s, { op: "equipNew", loadoutId: lo, side: "t", slot: "7", catalogId: 999 }, cat).ok, false);
  assert.equal(s.items.length, before, "nothing added when it does not fit");
});

test("loadouts: create, copy, rename, colour, activate, delete", () => {
  const s = store();
  R.applyOp(s, { op: "create" }, () => undefined);
  assert.equal(s.loadouts[2].name, "Loadout 3");
  R.applyOp(s, { op: "copy", loadoutId: s.loadouts[0].id }, () => undefined);
  assert.equal(s.loadouts[3].name, "Main copy");
  assert.equal(s.loadouts[3].equippedT["7"], "ak");
  assert.notEqual(s.loadouts[3].id, s.loadouts[0].id);
  R.applyOp(s, { op: "copy", loadoutId: s.loadouts[0].id }, () => undefined);
  assert.equal(s.loadouts[4].name, "Main copy 2");
  assert.equal(R.applyOp(s, { op: "rename", loadoutId: s.loadouts[1].id, name: "  Night\u0007  ops " }, () => undefined).ok, true);
  assert.equal(s.loadouts[1].name, "Night ops");
  assert.equal(R.applyOp(s, { op: "rename", loadoutId: s.loadouts[1].id, name: "   " }, () => undefined).ok, false);
  R.applyOp(s, { op: "color", loadoutId: s.loadouts[0].id }, () => undefined);
  assert.equal(s.loadouts[0].color, INV.LOADOUT_COLORS[1].hex);
  const act = R.applyOp(s, { op: "activate", loadoutId: s.loadouts[1].id }, () => undefined);
  assert.equal(act.affectsGame, true);
  const del = R.applyOp(s, { op: "delete", loadoutId: s.loadouts[1].id }, () => undefined);
  assert.equal(del.affectsGame, true);
  assert.equal(s.activeLoadoutId, s.loadouts[0].id, "deleting the one in use falls back to the first");
  while (s.loadouts.length > 1) R.applyOp(s, { op: "delete", loadoutId: s.loadouts[1].id }, () => undefined);
  assert.equal(R.applyOp(s, { op: "delete", loadoutId: s.loadouts[0].id }, () => undefined).ok, false);
});

test("parseOp rejects what the plugin should never send", () => {
  assert.equal(typeof R.parseOp({ op: "equip", loadoutId: "x", side: "both", slot: "7" }), "string");
  assert.equal(typeof R.parseOp({ op: "equip", loadoutId: "x", side: "t", slot: "999" }), "string");
  assert.equal(typeof R.parseOp({ op: "drop tables" }), "string");
  assert.deepEqual(R.parseOp({ op: "equip", loadoutId: "x", side: "t", slot: "knife", itemId: null }),
    { op: "equip", loadoutId: "x", side: "t", slot: "knife", itemId: null });
  assert.deepEqual(R.parseOp({ op: "equipNew", loadoutId: "x", side: "ct", slot: "60", catalogId: "12" }),
    { op: "equipNew", loadoutId: "x", side: "ct", slot: "60", catalogId: 12 });
});
