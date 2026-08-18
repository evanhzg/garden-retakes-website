import { radarPlane, cleanPath, sampleAt, pathDuration, decodeMapMesh, frameBounds, radarBounds, MESH_HEADER_BYTES } from "@/lib/utility3d";
import { MAPS, RADAR_SIZE, worldToRadar } from "@/lib/utilityShared";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};
const near = (a: number, b: number, eps = 1e-3) => Math.abs(a - b) < eps;

// --- radar plane: must agree with the 2D page's own calibration ------------
const mirage = MAPS["de_mirage"];
const plane = radarPlane(mirage)!;
check("mirage plane size is radar × scale", plane.size === RADAR_SIZE * mirage.scale!, String(plane.size));

// The plane's corners must land on the radar's corners under worldToRadar.
const half = plane.size / 2;
const topLeft = worldToRadar(mirage, plane.centre[0] - half, plane.centre[1] + half)!;
const bottomRight = worldToRadar(mirage, plane.centre[0] + half, plane.centre[1] - half)!;
check("plane top-left is radar pixel (0,0)", near(topLeft.px, 0) && near(topLeft.py, 0), JSON.stringify(topLeft));
check("plane bottom-right is radar pixel (1024,1024)",
  near(bottomRight.px, RADAR_SIZE) && near(bottomRight.py, RADAR_SIZE), JSON.stringify(bottomRight));

check("an uncalibrated map has no plane", radarPlane({ ...mirage, scale: null } as any) === null);

// --- paths -----------------------------------------------------------------
const raw: any = [[0,0,0,0],[100,0,50,0.5],[200,0,0,1],[200,0,0,1.5],[200.1,0,0,2]];
const clean = cleanPath(raw);
check("resting duplicates are dropped", clean.length === 3, JSON.stringify(clean));
check("duration spans first to last kept sample", near(pathDuration(clean), 1), String(pathDuration(clean)));

check("out-of-order samples are sorted", cleanPath([[200,0,0,1],[0,0,0,0]] as any).length === 2);
check("a one-point path is not drawable", cleanPath([[0,0,0,0]] as any).length === 0);
check("NaN samples are rejected", cleanPath([[0,0,0,0],[NaN,0,0,1]] as any).length === 0);
check("null is safe", cleanPath(null).length === 0);

const mid = sampleAt(clean, 0.25)!;
check("midpoint interpolates linearly", near(mid[0], 50) && near(mid[2], 25), JSON.stringify(mid));
check("before the start clamps", JSON.stringify(sampleAt(clean, -5)) === JSON.stringify([0,0,0]));
check("after the end clamps", near(sampleAt(clean, 99)![0], 200));
check("empty path samples to null", sampleAt([], 0) === null);

// --- mesh decode -----------------------------------------------------------
function buildMesh(verts: number[], idx: number[]) {
  const buf = new ArrayBuffer(MESH_HEADER_BYTES + verts.length * 4 + idx.length * 4);
  const v = new DataView(buf);
  "R5M1".split("").forEach((ch, i) => v.setUint8(i, ch.charCodeAt(0)));
  v.setUint32(4, verts.length / 3, true);
  v.setUint32(8, idx.length, true);
  [0,0,0,1,1,1].forEach((n, i) => v.setFloat32(12 + i * 4, n, true));
  new Float32Array(buf, MESH_HEADER_BYTES, verts.length).set(verts);
  new Uint32Array(buf, MESH_HEADER_BYTES + verts.length * 4, idx.length).set(idx);
  return buf;
}
const mesh = decodeMapMesh(buildMesh([0,0,0, 1,0,0, 0,1,0], [0,1,2]));
check("mesh decodes one triangle", mesh.triangles === 1 && mesh.positions.length === 9, JSON.stringify(mesh.triangles));
check("mesh bounds come back", mesh.bounds.max[0] === 1);

const bad = buildMesh([0,0,0], [0,1,2]);
new DataView(bad).setUint8(0, "X".charCodeAt(0));
try { decodeMapMesh(bad); check("bad magic throws", false); }
catch (e) { check("bad magic throws", String(e).includes("not a map mesh")); }

try { decodeMapMesh(new ArrayBuffer(4)); check("short file throws", false); }
catch (e) { check("short file throws", String(e).includes("too short")); }

const truncated = buildMesh([0,0,0, 1,0,0, 0,1,0], [0,1,2]).slice(0, MESH_HEADER_BYTES + 8);
try { decodeMapMesh(truncated); check("truncated file throws", false); }
catch (e) { check("truncated file throws", String(e).includes("truncated")); }

// --- framing ---------------------------------------------------------------
const f = frameBounds([-100,-100,0], [100,100,0]);
check("frame targets the centre", f.target[0] === 0 && f.target[1] === 0);
check("frame looks down from above", f.position[2] > 0, String(f.position[2]));
const dist = Math.hypot(f.position[0]-f.target[0], f.position[1]-f.target[1], f.position[2]-f.target[2]);
check("frame backs off past the radius", dist > 141, String(dist));
check("degenerate bounds do not divide by zero",
  Number.isFinite(frameBounds([0,0,0],[0,0,0]).position[0]));

const rb = radarBounds(mirage)!;
check("radar bounds cover the plane", near(rb.max[0] - rb.min[0], plane.size));

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
