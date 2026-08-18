#!/usr/bin/env node
/**
 * Turn a map's exported collision hull into the format the 3D viewer loads.
 *
 * You export, this converts. Source 2 Viewer against your CS2 install, on
 * `maps/<map>.vpk` → `world_physics.vmdl_c`, exported as OBJ or glTF; or a
 * `.tri` file out of a physics extractor. Any of the three works — they all
 * end up as the same triangle soup, and which one you happen to have is not
 * worth a second tool.
 *
 *   node tools/convert-map-mesh.mjs de_mirage ~/exports/de_mirage/world_physics.obj
 *
 * Writes `public/maps3d/<map>.mesh`, which is what `lib/utility3d.ts` decodes.
 *
 * Why a binary rather than JSON: a map's hull is tens of thousands of
 * triangles. As JSON numbers that is roughly four times the bytes and has to be
 * parsed into an array before a GPU can be shown it. This format is already the
 * layout three.js wants, so loading it is two typed-array views over the
 * downloaded buffer and no copying at all.
 *
 * Format, all little-endian, and documented in lib/utility3d.ts as well because
 * a format described in only one of the two places that speak it drifts:
 *
 *   magic      4 bytes  "R5M1"
 *   vertices   uint32   count of vertices, not floats
 *   indices    uint32   count of indices, always a multiple of 3
 *   bounds     6 × f32  minX minY minZ maxX maxY maxZ, Source units
 *   positions  vertices × 3 × f32
 *   indices    indices × uint32
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAGIC = "R5M1";
const HEADER_BYTES = 4 + 4 + 4 + 24;

/**
 * Positions and triangles out of a Wavefront OBJ.
 *
 * Only `v` and `f` are read. A physics hull has no materials, no normals and no
 * texture coordinates, and anything else in the file is from a different export
 * than the one we want.
 *
 * Faces may be triangles or larger polygons; larger ones are fanned. OBJ
 * indices are 1-based and may be negative, which means "counting back from the
 * end" — rare, but silently wrong if you assume otherwise, and it costs one
 * line to handle.
 */
function readObj(text) {
  const positions = [];
  const indices = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0 || line[0] === "#") continue;

    if (line.startsWith("v ")) {
      const [, x, y, z] = line.split(/\s+/);
      positions.push(Number(x), Number(y), Number(z));
      continue;
    }

    if (!line.startsWith("f ")) continue;

    const verts = line
      .slice(2)
      .trim()
      .split(/\s+/)
      // "12/4/7" — position index first, the rest are uv and normal.
      .map((chunk) => {
        const raw = Number.parseInt(chunk.split("/")[0], 10);
        return raw < 0 ? positions.length / 3 + raw : raw - 1;
      });

    for (let i = 2; i < verts.length; i++) {
      indices.push(verts[0], verts[i - 1], verts[i]);
    }
  }

  return { positions, indices };
}

/**
 * A `.tri` file: nine floats per triangle, no index, no header.
 *
 * Produced by the physics extractors. Every vertex is repeated per triangle,
 * so this is welded below rather than written out as-is — a hull written this
 * way is roughly three times the vertices it needs.
 */
function readTri(buffer) {
  if (buffer.length % 36 !== 0) {
    throw new Error(
      `.tri file is ${buffer.length} bytes, which is not a whole number of triangles ` +
        "(36 bytes each). Is it really a raw triangle list?",
    );
  }

  const positions = [];
  const indices = [];
  const floats = buffer.length / 4;

  for (let i = 0; i < floats; i++) {
    positions.push(buffer.readFloatLE(i * 4));
  }
  for (let i = 0; i < positions.length / 3; i++) {
    indices.push(i);
  }

  return { positions, indices };
}

/**
 * Merge vertices that are in the same place.
 *
 * A raw triangle list repeats every shared corner, so a hull comes in with
 * about three times the vertices it needs — which is three times the bytes to
 * download and, more to the point, prevents `computeVertexNormals` from
 * producing anything but flat shading.
 *
 * Quantised to a thousandth of a unit before comparing. Exporters round
 * differently on the way out, and two corners that differ in the seventh
 * decimal are the same corner.
 */
function weld({ positions, indices }) {
  const seen = new Map();
  const outPositions = [];
  const remap = new Array(positions.length / 3);

  for (let i = 0; i < positions.length / 3; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    const key = `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`;

    let index = seen.get(key);
    if (index === undefined) {
      index = outPositions.length / 3;
      seen.set(key, index);
      outPositions.push(x, y, z);
    }
    remap[i] = index;
  }

  // Welding can collapse a sliver triangle into a line, which has no area, no
  // normal, and shows up as a black streak. Dropped rather than drawn.
  const outIndices = [];
  let degenerate = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = remap[indices[i]];
    const b = remap[indices[i + 1]];
    const c = remap[indices[i + 2]];
    if (a === b || b === c || a === c) {
      degenerate++;
      continue;
    }
    outIndices.push(a, b, c);
  }

  return { positions: outPositions, indices: outIndices, degenerate };
}

function encode({ positions, indices }) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    if (positions[i] < minX) minX = positions[i];
    if (positions[i] > maxX) maxX = positions[i];
    if (positions[i + 1] < minY) minY = positions[i + 1];
    if (positions[i + 1] > maxY) maxY = positions[i + 1];
    if (positions[i + 2] < minZ) minZ = positions[i + 2];
    if (positions[i + 2] > maxZ) maxZ = positions[i + 2];
  }

  const buffer = Buffer.alloc(HEADER_BYTES + positions.length * 4 + indices.length * 4);
  buffer.write(MAGIC, 0, "ascii");
  buffer.writeUInt32LE(positions.length / 3, 4);
  buffer.writeUInt32LE(indices.length, 8);
  [minX, minY, minZ, maxX, maxY, maxZ].forEach((n, i) => buffer.writeFloatLE(n, 12 + i * 4));

  let at = HEADER_BYTES;
  for (const n of positions) {
    buffer.writeFloatLE(n, at);
    at += 4;
  }
  for (const n of indices) {
    buffer.writeUInt32LE(n, at);
    at += 4;
  }

  return { buffer, bounds: { minX, minY, minZ, maxX, maxY, maxZ } };
}

function main() {
  const [map, input] = process.argv.slice(2);
  if (!map || !input) {
    console.error("usage: node tools/convert-map-mesh.mjs <map> <world_physics.obj|.tri>");
    console.error("   eg: node tools/convert-map-mesh.mjs de_mirage ~/exports/de_mirage/world_physics.obj");
    process.exit(2);
  }

  if (!/^[a-z0-9_]+$/i.test(map)) {
    // The map name becomes a filename under public/, so it does not get to
    // contain a path.
    console.error(`"${map}" is not a map name.`);
    process.exit(2);
  }

  if (!fs.existsSync(input)) {
    console.error(`No such file: ${input}`);
    process.exit(2);
  }

  const extension = path.extname(input).toLowerCase();
  let raw;
  if (extension === ".obj") {
    raw = readObj(fs.readFileSync(input, "utf8"));
  } else if (extension === ".tri") {
    raw = readTri(fs.readFileSync(input));
  } else {
    console.error(
      `Do not know how to read "${extension}". Export as .obj (Source 2 Viewer) or .tri (physics extractor).`,
    );
    process.exit(2);
  }

  if (raw.indices.length === 0) {
    console.error("No triangles in that file. Is it the physics hull rather than the render model?");
    process.exit(1);
  }

  const welded = weld(raw);
  const { buffer, bounds } = encode(welded);

  const outDir = path.join(ROOT, "public", "maps3d");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${map}.mesh`);
  fs.writeFileSync(outPath, buffer);

  const span = (a, b) => Math.round(b - a);
  console.log(`${map}:`);
  console.log(`  ${(raw.positions.length / 3).toLocaleString()} vertices in, ${(welded.positions.length / 3).toLocaleString()} after welding`);
  console.log(`  ${(welded.indices.length / 3).toLocaleString()} triangles${welded.degenerate ? `, ${welded.degenerate} degenerate dropped` : ""}`);
  console.log(`  ${span(bounds.minX, bounds.maxX)} × ${span(bounds.minY, bounds.maxY)} × ${span(bounds.minZ, bounds.maxZ)} units`);
  console.log(`  ${(buffer.length / 1024 / 1024).toFixed(2)} MB → public/maps3d/${map}.mesh`);

  // A hull the size of a house is a prop, not a map. Worth saying out loud,
  // because the export dialog will happily give you one model out of many and
  // the result looks like a working file right up until you open the viewer.
  if (span(bounds.minX, bounds.maxX) < 1000 || span(bounds.minY, bounds.maxY) < 1000) {
    console.warn(
      "\n  ! That is small for a map. A CS2 map spans several thousand units across.\n" +
        "    Check you exported world_physics from the map rather than a single model.",
    );
  }
}

main();
