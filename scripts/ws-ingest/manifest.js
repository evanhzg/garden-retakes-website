// Writing the ingest result out.
//
// Three artefacts, because two different consumers need different shapes:
//
//   data/workshop/<id>.json   one record per skin — the source of truth
//   data/workshop/index.json  every record in one array, for the web inventory
//                             and the plugin to read in a single load
//   data/workshop/<id>.sql    optional mock INSERT, for wiring into MySQL later

const fs = require("node:fs");
const path = require("node:path");

/**
 * Which of the `.vmat_c` files is *the skin*.
 *
 * A skin VPK usually carries more than one material: the custom paint plus a
 * copy of the base weapon material it overrides. Sorted alphabetically the base
 * weapon tends to come first, which is exactly the wrong one to hand the
 * plugin — so prefer anything living under a customization/paints path, then
 * anything that merely says "custom", and only then fall back to the first.
 */
function pickPrimaryMaterial(materials) {
  if (!materials.length) return null;
  const lower = (m) => m.toLowerCase();

  const paints = materials.filter((m) => /customization\/paints|\/paints\/custom/.test(lower(m)));
  if (paints.length) return paints[0];

  const custom = materials.filter((m) => lower(m).includes("custom"));
  if (custom.length) return custom[0];

  const notBase = materials.filter((m) => !lower(m).includes("base_weapons"));
  return (notBase.length ? notBase : materials)[0];
}

/** Shape the record both the plugin and the site consume. */
function buildRecord({ details, weapon, preview, vpk, materials, webPath }) {
  return {
    workshopId: details.workshopId,
    name: details.title,
    description: details.description,
    // `def` is what InventorySimulator's InventoryItem and /api/skins key on.
    def: weapon?.def ?? null,
    weapon: weapon?.name ?? null,
    weaponModel: weapon?.model ?? null,
    weaponResolvedVia: weapon?.via ?? null,
    tags: details.tags,
    // What the !ws plugin needs: the compiled material(s) inside the VPK.
    // `primaryMaterial` is the paint itself; `materials` is everything found.
    primaryMaterial: pickPrimaryMaterial(materials),
    materials,
    vpk: vpk
      ? { file: vpk.file, bytes: vpk.bytes, version: vpk.version, entryCount: vpk.entryCount }
      : null,
    preview: preview
      ? {
        // Absolute-ish local path for tooling…
        file: preview.file,
        // …and the URL the website serves it from.
        webPath,
        format: preview.ext,
        sourceFormat: preview.sourceExt,
        bytes: preview.bytes,
        sourceUrl: details.previewUrl,
      }
      : null,
    steam: {
      creator: details.creator,
      fileSize: details.fileSize,
      timeCreated: details.timeCreated,
      timeUpdated: details.timeUpdated,
      subscriptions: details.subscriptions,
      favorited: details.favorited,
      views: details.views,
    },
    ingestedAt: new Date().toISOString(),
  };
}

function writeRecord(dataDir, record) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, `${record.workshopId}.json`);
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  return file;
}

/** Rebuild index.json from every per-skin file on disk. */
function rebuildIndex(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const records = [];
  for (const name of fs.readdirSync(dataDir)) {
    if (!/^\d+\.json$/.test(name)) continue;
    try {
      records.push(JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf8")));
    } catch {
      // A half-written file shouldn't take the whole index down.
    }
  }
  records.sort((a, b) => String(a.workshopId).localeCompare(String(b.workshopId)));

  const file = path.join(dataDir, "index.json");
  fs.writeFileSync(
    file,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), count: records.length, skins: records }, null, 2)}\n`
  );
  return { file, count: records.length };
}

const sqlString = (v) =>
  v == null ? "NULL" : `'${String(v).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;

/**
 * A mock INSERT. The table doesn't exist yet — the DDL is emitted alongside it
 * so you can decide whether to adopt it as-is.
 */
function writeSql(dataDir, record) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, `${record.workshopId}.sql`);

  const ddl = `-- Proposed table. Nothing creates this yet; review before running.
CREATE TABLE IF NOT EXISTS GardenWorkshopSkin (
  WorkshopId   BIGINT       NOT NULL PRIMARY KEY,
  Def          INT          NULL,
  Name         VARCHAR(255) NOT NULL,
  WeaponName   VARCHAR(64)  NULL,
  MaterialPath VARCHAR(512) NULL,
  Materials    JSON         NULL,
  PreviewPath  VARCHAR(512) NULL,
  IngestedAtUtc DATETIME(6) NOT NULL
);`;

  const insert = `INSERT INTO GardenWorkshopSkin
  (WorkshopId, Def, Name, WeaponName, MaterialPath, Materials, PreviewPath, IngestedAtUtc)
VALUES
  (${record.workshopId}, ${record.def ?? "NULL"}, ${sqlString(record.name)}, ${sqlString(record.weapon)},
   ${sqlString(record.primaryMaterial)}, ${sqlString(JSON.stringify(record.materials))},
   ${sqlString(record.preview?.webPath ?? null)}, ${sqlString(record.ingestedAt.replace("T", " ").replace("Z", ""))})
ON DUPLICATE KEY UPDATE
  Def = VALUES(Def), Name = VALUES(Name), WeaponName = VALUES(WeaponName),
  MaterialPath = VALUES(MaterialPath), Materials = VALUES(Materials),
  PreviewPath = VALUES(PreviewPath), IngestedAtUtc = VALUES(IngestedAtUtc);`;

  fs.writeFileSync(file, `${ddl}\n\n${insert}\n`);
  return file;
}

module.exports = { buildRecord, writeRecord, rebuildIndex, writeSql, pickPrimaryMaterial };
