// Round-trip test for the VPK directory reader.
//
// There is no CS2 VPK checked into this repo (they are hundreds of megabytes),
// so the test builds archives byte-by-byte to the documented layout and asserts
// the reader recovers exactly the paths that went in — including the awkward
// corners: " " for the archive root, extension-less files, inline preload data
// and both header versions.
//
// Run with: node scripts/ws-ingest/vpk.test.js

const assert = require("node:assert");
const { readVpkBuffer, findByExtension, VpkError } = require("./vpk");

/** Build a VPK directory blob from `{ ext: { dir: [ {name, preload} ] } }`. */
function buildVpk(tree, { version = 2 } = {}) {
  const chunks = [];
  const cstr = (s) => Buffer.concat([Buffer.from(s, "utf8"), Buffer.from([0])]);

  for (const [ext, dirs] of Object.entries(tree)) {
    chunks.push(cstr(ext));
    for (const [dir, files] of Object.entries(dirs)) {
      chunks.push(cstr(dir));
      for (const file of files) {
        chunks.push(cstr(file.name));
        const preload = file.preload ? Buffer.from(file.preload, "utf8") : Buffer.alloc(0);
        const meta = Buffer.alloc(18);
        meta.writeUInt32LE(0x12345678, 0);   // crc
        meta.writeUInt16LE(preload.length, 4);
        meta.writeUInt16LE(file.archiveIndex ?? 0x7fff, 6);
        meta.writeUInt32LE(file.offset ?? 0, 8);
        meta.writeUInt32LE(file.length ?? 0, 12);
        meta.writeUInt16LE(0xffff, 16);      // terminator
        chunks.push(meta, preload);
      }
      chunks.push(Buffer.from([0]));         // end of files
    }
    chunks.push(Buffer.from([0]));           // end of dirs
  }
  chunks.push(Buffer.from([0]));             // end of tree

  const treeBuf = Buffer.concat(chunks);
  const headerSize = version === 1 ? 12 : 28;
  const header = Buffer.alloc(headerSize);
  header.writeUInt32LE(0x55aa1234, 0);
  header.writeUInt32LE(version, 4);
  header.writeUInt32LE(treeBuf.length, 8);
  return Buffer.concat([header, treeBuf]);
}

let passed = 0;
const check = (label, fn) => {
  try {
    fn();
    passed++;
    console.log(`  ok   ${label}`);
  } catch (err) {
    console.error(`  FAIL ${label}\n       ${err.message}`);
    process.exitCode = 1;
  }
};

console.log("VPK reader");

check("reads a realistic CS2 skin layout (v2)", () => {
  const buf = buildVpk({
    vmat_c: {
      "materials/models/weapons/customization/paints/custom": [
        { name: "awp_skin" },
        { name: "glock_magic_touch" },
      ],
      "materials/models/weapons/base_weapons": [{ name: "weapon_awp" }],
    },
    vtex_c: {
      "materials/models/weapons/customization/paints/custom": [{ name: "awp_skin_color_png" }],
    },
    txt: { " ": [{ name: "readme" }] },
  });

  const { version, entries } = readVpkBuffer(buf);
  assert.strictEqual(version, 2);

  const paths = entries.map((e) => e.path).sort();
  assert.deepStrictEqual(paths, [
    "materials/models/weapons/base_weapons/weapon_awp.vmat_c",
    "materials/models/weapons/customization/paints/custom/awp_skin.vmat_c",
    "materials/models/weapons/customization/paints/custom/awp_skin_color_png.vtex_c",
    "materials/models/weapons/customization/paints/custom/glock_magic_touch.vmat_c",
    "readme.txt",
  ]);
});

check("filters to .vmat_c only", () => {
  const buf = buildVpk({
    vmat_c: { "materials/a": [{ name: "one" }, { name: "two" }] },
    vtex_c: { "materials/a": [{ name: "tex" }] },
    vmdl_c: { "models/a": [{ name: "gun" }] },
  });
  const { entries } = readVpkBuffer(buf);
  const mats = findByExtension(entries).map((e) => e.path).sort();
  assert.deepStrictEqual(mats, ["materials/a/one.vmat_c", "materials/a/two.vmat_c"]);
});

check('handles " " root directory and extension-less files', () => {
  const buf = buildVpk({ " ": { " ": [{ name: "LICENSE" }] } });
  const { entries } = readVpkBuffer(buf);
  assert.deepStrictEqual(entries.map((e) => e.path), ["LICENSE"]);
});

check("steps over inline preload data", () => {
  const buf = buildVpk({
    vmat_c: {
      "materials/x": [
        { name: "small", preload: "INLINE-BYTES-HERE" },
        { name: "after" },
      ],
    },
  });
  const { entries } = readVpkBuffer(buf);
  assert.deepStrictEqual(entries.map((e) => e.path), [
    "materials/x/small.vmat_c",
    "materials/x/after.vmat_c",
  ]);
  assert.strictEqual(entries[0].preloadBytes, 17);
});

check("reads v1 headers too", () => {
  const buf = buildVpk({ vmat_c: { "materials/y": [{ name: "v1file" }] } }, { version: 1 });
  const { version, entries } = readVpkBuffer(buf);
  assert.strictEqual(version, 1);
  assert.deepStrictEqual(entries.map((e) => e.path), ["materials/y/v1file.vmat_c"]);
});

check("keeps entry metadata", () => {
  const buf = buildVpk({
    vmat_c: { "materials/z": [{ name: "m", archiveIndex: 3, offset: 4096, length: 2048 }] },
  });
  const [entry] = readVpkBuffer(buf).entries;
  assert.strictEqual(entry.archiveIndex, 3);
  assert.strictEqual(entry.offset, 4096);
  assert.strictEqual(entry.length, 2048);
});

check("rejects a non-VPK", () => {
  assert.throws(() => readVpkBuffer(Buffer.from("not a vpk at all!!")), VpkError);
});

check("rejects an unsupported version", () => {
  const buf = buildVpk({ vmat_c: { a: [{ name: "b" }] } });
  buf.writeUInt32LE(9, 4);
  assert.throws(() => readVpkBuffer(buf), /unsupported VPK version 9/);
});

check("rejects a truncated tree", () => {
  const buf = buildVpk({ vmat_c: { a: [{ name: "b" }] } });
  assert.throws(() => readVpkBuffer(buf.subarray(0, buf.length - 12)), VpkError);
});

console.log(`\n${passed} passed${process.exitCode ? " (with failures)" : ""}`);
