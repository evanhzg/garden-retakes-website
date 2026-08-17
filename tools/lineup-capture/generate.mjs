#!/usr/bin/env node
/**
 * Stage 1 — turn the lineup table into a CS2 config the game can be driven with.
 *
 * The problem: a lineup is only useful if you can see it. Coordinates tell you
 * where to stand but not what to look at, and "pitch -12.4, yaw 83.1" is not
 * something a person can aim by. What people actually use is a picture of the
 * crosshair sitting on the right corner of the right building.
 *
 * CS2 has no remote console — `-netconport` was a Source 1 feature and the
 * strings are gone from engine2.dll — so the game cannot be told what to do
 * from outside. What it *can* do is run a config, and a config can define an
 * alias chain: one bound key that walks a cursor through a list of positions,
 * teleporting and re-arming at each step. Driving it then costs one keypress
 * per step, which a Windows-side script can send.
 *
 * So this writes:
 *   - garden_cap_<map>.cfg, the alias chain plus a clean-capture preset;
 *   - garden_cap_<map>.json, the same list in order, so the screenshots that
 *     come out the other end can be matched back to the lineups that produced
 *     them. The game names screenshots sequentially and knows nothing about
 *     lineup ids, so the ordering *is* the join key.
 *
 * Usage:
 *   node tools/lineup-capture/generate.mjs                 # every map with lineups
 *   node tools/lineup-capture/generate.mjs --map de_mirage
 *   node tools/lineup-capture/generate.mjs --all           # include unverified
 *   node tools/lineup-capture/generate.mjs --map de_mirage --pending
 *
 * `--pending` is the one the Game Maker's capture queue hands you: only the
 * lineups still flagged NeedsShots. Without it a second run re-photographs
 * every lineup on the map to add the three that were validated this week.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { PrismaClient } from "@prisma/client";

const CS2_CFG_DIR =
  process.env.CS2_CFG_DIR ??
  "/mnt/d/Steam/steamapps/common/Counter-Strike Global Offensive/game/csgo/cfg";

const OUT_DIR = path.resolve(process.cwd(), "tools/lineup-capture/out");

const WEAPON = {
  smoke: "weapon_smokegrenade",
  flash: "weapon_flashbang",
  molotov: "weapon_molotov",
  he: "weapon_hegrenade",
  decoy: "weapon_decoy",
};

/**
 * The clean-capture preset.
 *
 * `cl_draw_only_deathnotices 1` rather than `cl_drawhud 0`: the crosshair is
 * the single most important thing in a lineup image and drawhud takes it away
 * with everything else. Everything below it is a thing that would otherwise
 * end up baked into 300 screenshots — a killfeed, an fps counter, a radar in
 * the corner showing a different map region than the one being photographed.
 */
const PRESET = [
  "sv_cheats 1",
  "sv_infinite_ammo 2",
  "ammo_grenade_limit_total 6",
  "mp_warmup_end",
  "mp_freezetime 0",
  "mp_roundtime 60",
  "mp_roundtime_defuse 60",
  "mp_ignore_round_win_conditions 1",
  "mp_respawn_on_death_t 1",
  "mp_respawn_on_death_ct 1",
  "bot_kick",
  "mp_autoteambalance 0",
  "mp_limitteams 0",
  "sv_alltalk 1",
  // Clean frame.
  "cl_draw_only_deathnotices 1",
  "cl_drawhud_force_radar -1",
  "cl_showfps 0",
  "net_graph 0",
  "hud_showtargetid 0",
  "cl_showloadout 0",
  "sv_showimpacts 0",
  "cl_hud_telemetry_frametime_show 0",
  "cl_hud_telemetry_ping_show 0",
  "cl_hud_telemetry_net_misdelivery_show 0",
  // The grenade in hand should be visible — it says which utility this is.
  "r_drawviewmodel 1",
  "viewmodel_offset_x 2.5",
  "viewmodel_offset_y 2",
  "viewmodel_offset_z -2",
  // A trajectory line makes the throw legible in the result shot without
  // needing a video. It is a practice cvar and costs nothing here.
  "sv_grenade_trajectory_prac_pipreview 0",
  "sv_grenade_trajectory_time_spectator 0",
  // No weather, no time-of-day drift between two runs of the same map.
  "sv_skyname_set 0",
];

/**
 * Everything that has to die before the next lineup is photographed.
 *
 * A smoke lasts eighteen seconds and the capture loop moves faster than that,
 * so without this the third lineup on a map is shot through the second one's
 * smoke. Molotovs are worse: the fire is a separate entity from the projectile
 * and outlives it.
 */
const CLEANUP = [
  "ent_fire smokegrenade_projectile kill",
  "ent_fire molotov_projectile kill",
  // The CT incendiary is a different class from the T molotov, and it was
  // missing — so a lineup captured after an incendiary was photographed through
  // the previous one's fire. The plugin's UtilityCleanup carries the same list
  // and a test fails if the two drift apart again.
  "ent_fire incgrenade_projectile kill",
  "ent_fire flashbang_projectile kill",
  "ent_fire hegrenade_projectile kill",
  "ent_fire decoy_projectile kill",
  "ent_fire inferno kill",
  // A CS:GO entity, harmless to fire at in CS2 where the smoke volume is the
  // projectile itself. Kept because the cost is one no-op console line and the
  // alternative is rediscovering that the hard way.
  "ent_fire env_particlesmokegrenade kill",
].join("; ");

const num = (v) => {
  const n = Number(v);
  // Six digits is far more precision than an angle needs and makes the config
  // unreadable; three keeps a hundredth of a degree, which is under one pixel
  // at any sane resolution.
  return Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : "0";
};

function buildCfg(map, rows) {
  const lines = [
    `// Generated by tools/lineup-capture/generate.mjs — do not edit by hand.`,
    `// ${rows.length} lineups on ${map}.`,
    `//`,
    `// F9  advance to the next lineup (teleport, aim, re-arm, clear old utility)`,
    `// F10 take a screenshot`,
    `// F11 hold to throw (jump-throw when held, plain throw when tapped)`,
    `// F8  jump back to the first lineup`,
    ``,
    ...PRESET,
    ``,
    // Factored out rather than repeated per lineup: the console truncates a
    // command at 512 characters, and inlining seven ent_fire calls into each of
    // two hundred aliases puts them within a coordinate's width of that limit.
    `alias g_clean "${CLEANUP}"`,
    ``,
  ];

  rows.forEach((r, i) => {
    const next = i + 1 < rows.length ? `g_${i + 1}` : "g_0";
    const weapon = WEAPON[r.Utility] ?? WEAPON.smoke;
    // give then use: `give` alone drops it into the inventory without equipping
    // it, and an unequipped grenade means the viewmodel shows a rifle in a
    // picture whose whole point is which grenade this is.
    lines.push(
      `alias g_${i} "g_clean; setpos ${num(r.StandX)} ${num(r.StandY)} ${num(r.StandZ)}; ` +
        `setang ${num(r.Pitch)} ${num(r.Yaw)} 0; give ${weapon}; use ${weapon}; ` +
        `alias g_next ${next}; echo GARDENCAP ${i} ${r.Id}"`
    );
  });

  lines.push(
    ``,
    `alias g_next g_0`,
    // A jump-throw is a release-timed action: jump and attack go down together,
    // attack comes up first. Bound as a +/- pair so holding the key for a beat
    // and letting go reproduces it, and tapping it is an ordinary throw.
    `alias +gthrow "+jump; +attack"`,
    `alias -gthrow "-attack; -jump"`,
    `bind F8 "g_0"`,
    `bind F9 "g_next"`,
    `bind F10 "jpeg"`,
    `bind F11 "+gthrow"`,
    ``,
    `echo "GARDENCAP ready: ${rows.length} lineups on ${map}. F9 next, F10 shot, F11 throw."`,
    `g_0`,
    ``
  );

  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.includes("--map") ? args[args.indexOf("--map") + 1] : null;
  const includeUnverified = args.includes("--all");
  const pendingOnly = args.includes("--pending");

  const prisma = new PrismaClient();
  try {
    const where = [];
    const params = [];
    if (only) {
      where.push("Map = ?");
      params.push(only);
    }
    if (!includeUnverified) where.push("Verified = 1");
    if (pendingOnly) where.push("NeedsShots = 1");
    const sql =
      `SELECT Id, Map, Name, Area, Utility, Purpose, Team, ThrowType, ClickType, ` +
      `StandX, StandY, StandZ, Pitch, Yaw, Verified, NeedsShots FROM GardenNades ` +
      (where.length ? `WHERE ${where.join(" AND ")} ` : "") +
      // Grouped by area so consecutive shots are near each other: it keeps the
      // teleports short and makes a half-finished run still cover whole areas.
      `ORDER BY Map, Area, Utility, Name`;

    const rows = await prisma.$queryRawUnsafe(sql, ...params);
    if (rows.length === 0) {
      console.error(
        pendingOnly
          ? "Nothing pending — every lineup that matched already has its shots."
          : "No lineups matched."
      );
      process.exitCode = 1;
      return;
    }

    const byMap = new Map();
    for (const r of rows) {
      if (!byMap.has(r.Map)) byMap.set(r.Map, []);
      byMap.get(r.Map).push(r);
    }

    fs.mkdirSync(OUT_DIR, { recursive: true });
    const cfgDirExists = fs.existsSync(CS2_CFG_DIR);
    if (!cfgDirExists) {
      console.warn(`! CS2 cfg dir not found (${CS2_CFG_DIR}) — writing to ${OUT_DIR} only.`);
    }

    for (const [map, list] of byMap) {
      const cfg = buildCfg(map, list);
      const name = `garden_cap_${map}.cfg`;
      fs.writeFileSync(path.join(OUT_DIR, name), cfg);
      if (cfgDirExists) fs.writeFileSync(path.join(CS2_CFG_DIR, name), cfg);

      const manifest = {
        map,
        generatedFrom: "GardenNades",
        includeUnverified,
        pendingOnly,
        count: list.length,
        lineups: list.map((r, i) => ({
          index: i,
          id: Number(r.Id),
          name: r.Name,
          area: r.Area,
          utility: r.Utility,
          throwType: r.ThrowType,
          clickType: r.ClickType,
          verified: Boolean(r.Verified),
          needsShots: Boolean(r.NeedsShots),
          stand: { x: Number(r.StandX), y: Number(r.StandY), z: Number(r.StandZ) },
          view: { pitch: Number(r.Pitch), yaw: Number(r.Yaw) },
        })),
      };
      fs.writeFileSync(
        path.join(OUT_DIR, `garden_cap_${map}.json`),
        JSON.stringify(manifest, null, 2)
      );

      console.log(`${map}: ${list.length} lineups -> ${name}`);
    }

    console.log(`\nIn game:  exec garden_cap_<map>`);
    console.log(`Manifests: ${OUT_DIR}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
