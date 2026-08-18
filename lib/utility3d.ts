import { MAPS, RADAR_SIZE, type MapOverview } from "@/lib/utilityShared";

/**
 * The maths and file formats behind the 3D utility viewer.
 *
 * Kept out of the React component on purpose. Everything here is a pure
 * function of numbers and buffers, which means the parts most likely to be
 * wrong — the world-to-scene transform and the mesh decoder — can be checked
 * without a browser or a GPU.
 *
 * <b>Coordinates.</b> Source is Z-up: X east, Y north, Z up, units of roughly
 * one inch. three.js is Y-up. Rather than converting every coordinate on the
 * way in — which means every lineup, every arc sample and every mesh vertex
 * gets a transform applied that somebody will eventually forget — the scene
 * keeps Source coordinates verbatim and tells the camera that up is +Z. One
 * decision in one place, and a number you read in the game is the number you
 * read in the debugger.
 */

/** Source units per metre, for anything that wants a human-readable distance. */
export const UNITS_PER_METRE = 39.37;

/**
 * The world-space square a map's radar image covers.
 *
 * Straight out of the same calibration the 2D page uses: the radar is an
 * orthographic shot whose top-left pixel sits at (posX, posY), covering
 * RADAR_SIZE pixels at `scale` units each. Returned as a centre and a size
 * because that is what a plane needs.
 */
export function radarPlane(cfg: MapOverview): { centre: [number, number]; size: number } | null {
  if (cfg.posX === null || cfg.posY === null || !cfg.scale) return null;

  const size = RADAR_SIZE * cfg.scale;
  return {
    // posX is the *left* edge and posY the *top* edge, so the centre is half a
    // span to the right of one and half a span below the other. Getting this
    // wrong puts the whole map a quarter-map out and still looks plausible.
    centre: [cfg.posX + size / 2, cfg.posY - size / 2],
    size,
  };
}

/** A map we can draw at all: it needs calibration, which not every map has. */
export function canRender3d(map: string): boolean {
  const cfg = MAPS[map];
  return Boolean(cfg && cfg.scale !== null && cfg.posX !== null && cfg.posY !== null);
}

// ------------------------------------------------------------------ arcs

export type PathSample = [number, number, number, number];

/**
 * A recorded arc, cleaned up enough to draw.
 *
 * Recorded paths come from the server after Ramer–Douglas–Peucker, so they are
 * at most 24 points and the spacing between them is uneven by design — the
 * simplifier keeps the corners and throws away the straight bits. That is
 * exactly right for storage and wrong for a tube, which needs the samples in
 * time order and free of the duplicates that a grenade resting on the floor
 * produces.
 */
export function cleanPath(path: PathSample[] | null | undefined): PathSample[] {
  if (!path || path.length < 2) return [];

  const sorted = [...path]
    .filter((p) => Array.isArray(p) && p.length >= 4 && p.every((n) => Number.isFinite(n)))
    .sort((a, b) => a[3] - b[3]);

  const out: PathSample[] = [];
  for (const p of sorted) {
    const last = out[out.length - 1];
    // Under a quarter of a unit apart is the same place. A grenade that has
    // come to rest emits the same point until it detonates, and a curve fitted
    // through repeated points produces NaN tangents and a tube that vanishes.
    if (last && Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]) < 0.25) continue;
    out.push(p);
  }

  return out.length >= 2 ? out : [];
}

/** Total flight time of a cleaned path, in seconds. */
export function pathDuration(path: PathSample[]): number {
  return path.length >= 2 ? Math.max(0, path[path.length - 1][3] - path[0][3]) : 0;
}

/**
 * Where the grenade was at time <paramref name="t"/>, interpolating between samples.
 *
 * Linear rather than along the fitted curve: the curve exists to look right,
 * and the marker exists to say where the thing actually was at that moment.
 * Disagreeing by a few units in favour of the recorded data is the correct way
 * round.
 */
export function sampleAt(path: PathSample[], t: number): [number, number, number] | null {
  if (path.length === 0) return null;
  if (path.length === 1) return [path[0][0], path[0][1], path[0][2]];

  const first = path[0][3];
  const clamped = Math.min(Math.max(t, first), path[path.length - 1][3]);

  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (clamped > b[3]) continue;

    const span = b[3] - a[3];
    const f = span > 0 ? (clamped - a[3]) / span : 0;
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }

  const last = path[path.length - 1];
  return [last[0], last[1], last[2]];
}

// ------------------------------------------------------------- map meshes

/**
 * The compact mesh format the map geometry is served in.
 *
 * A binary buffer rather than JSON, for a reason worth stating: a map's physics
 * hull is tens of thousands of triangles, and the same data as JSON numbers is
 * roughly four times the bytes and needs parsing into an array before it can be
 * handed to a GPU. This is already in the layout three.js wants, so decoding is
 * two typed-array views over the same buffer and no copying at all.
 *
 * Layout, all little-endian:
 *
 *   magic      4 bytes  "R5M1"
 *   vertices   uint32   count of vertices, not floats
 *   indices    uint32   count of indices, always a multiple of 3
 *   bounds     6 × f32  minX minY minZ maxX maxY maxZ, in Source units
 *   positions  vertices × 3 × f32
 *   indices    indices × uint32
 *
 * Bounds are stored rather than computed so the viewer can frame a map before
 * it has walked a hundred thousand vertices.
 */
export const MESH_MAGIC = "R5M1";
export const MESH_HEADER_BYTES = 4 + 4 + 4 + 24;

export type MapMesh = {
  positions: Float32Array;
  indices: Uint32Array;
  bounds: { min: [number, number, number]; max: [number, number, number] };
  triangles: number;
};

export function decodeMapMesh(buffer: ArrayBuffer): MapMesh {
  if (buffer.byteLength < MESH_HEADER_BYTES) {
    throw new Error("mesh file is too short to hold a header");
  }

  const view = new DataView(buffer);
  const magic = String.fromCharCode(
    view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3),
  );
  if (magic !== MESH_MAGIC) {
    throw new Error(`not a map mesh (magic was ${JSON.stringify(magic)})`);
  }

  const vertexCount = view.getUint32(4, true);
  const indexCount = view.getUint32(8, true);
  if (indexCount % 3 !== 0) {
    throw new Error(`index count ${indexCount} is not a whole number of triangles`);
  }

  const bounds = {
    min: [view.getFloat32(12, true), view.getFloat32(16, true), view.getFloat32(20, true)] as [number, number, number],
    max: [view.getFloat32(24, true), view.getFloat32(28, true), view.getFloat32(32, true)] as [number, number, number],
  };

  const positionBytes = vertexCount * 3 * 4;
  const expected = MESH_HEADER_BYTES + positionBytes + indexCount * 4;
  if (buffer.byteLength < expected) {
    throw new Error(`mesh file is truncated: expected ${expected} bytes, got ${buffer.byteLength}`);
  }

  // Views, not copies. The buffer is the geometry.
  return {
    positions: new Float32Array(buffer, MESH_HEADER_BYTES, vertexCount * 3),
    indices: new Uint32Array(buffer, MESH_HEADER_BYTES + positionBytes, indexCount),
    bounds,
    triangles: indexCount / 3,
  };
}

/** Where a map's mesh lives, when somebody has exported one. */
export const meshUrl = (map: string) => `/maps3d/${map}.mesh`;

/**
 * A camera position that frames the whole of something.
 *
 * Distance from the bounding sphere and the field of view rather than a guess,
 * so a small map and a large one both open filling the same fraction of the
 * screen. The 1.35 is headroom: framing a sphere exactly puts its edges on the
 * edges of the viewport, which reads as too close.
 */
export function frameBounds(
  min: [number, number, number],
  max: [number, number, number],
  fovDegrees = 55,
): { target: [number, number, number]; position: [number, number, number] } {
  const centre: [number, number, number] = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];

  const radius = Math.max(
    1,
    Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2,
  );

  const distance = (radius * 1.35) / Math.sin((fovDegrees * Math.PI) / 360);

  // Looking down from the south-west at about 40°, which is close enough to how
  // a radar is read that the map is recognisable before you have moved.
  const pitch = (40 * Math.PI) / 180;
  const yaw = (-135 * Math.PI) / 180;
  return {
    target: centre,
    position: [
      centre[0] + distance * Math.cos(pitch) * Math.cos(yaw),
      centre[1] + distance * Math.cos(pitch) * Math.sin(yaw),
      centre[2] + distance * Math.sin(pitch),
    ],
  };
}

/**
 * Bounds for a map with no mesh yet: the radar square, and a sensible height.
 *
 * Every CS2 map fits comfortably inside its radar horizontally, and vertically
 * they run to a couple of thousand units. This only decides where the camera
 * starts, so being roughly right is entirely sufficient.
 */
export function radarBounds(cfg: MapOverview): { min: [number, number, number]; max: [number, number, number] } | null {
  const plane = radarPlane(cfg);
  if (!plane) return null;

  const half = plane.size / 2;
  return {
    min: [plane.centre[0] - half, plane.centre[1] - half, -256],
    max: [plane.centre[0] + half, plane.centre[1] + half, 1024],
  };
}
