"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { MAPS, UTIL_COLOUR, type Lineup } from "@/lib/utilityShared";
import {
  cleanPath,
  decodeMapMesh,
  frameBounds,
  meshUrl,
  pathDuration,
  radarBounds,
  radarPlane,
  sampleAt,
  type MapMesh,
  type PathSample,
} from "@/lib/utility3d";

/**
 * The utility page in three dimensions.
 *
 * <b>Why this exists.</b> A radar can show you where a smoke lands and can
 * never show you the arc that got it there — which is the entire content of a
 * lineup. The 2D page has taken that as far as it goes.
 *
 * <b>What is real here.</b> Every arc drawn is a recorded one: the server
 * samples the projectile during capture and stores it as `[x, y, z, t]` after
 * simplification. Nothing on this screen is simulated, extrapolated or guessed.
 * That matters because the next phase *is* simulation, and the only way to know
 * whether a simulator is right is to have a body of measured arcs to check it
 * against. This screen is that body, made visible.
 *
 * <b>The floor.</b> Map geometry is a separate export — Source 2 Viewer against
 * `world_physics.vmdl_c`, converted by `tools/convert-map-mesh.mjs`. Until a map
 * has one, the radar image stands in as a textured plane at exactly the world
 * position its calibration says it covers, which is enough to recognise where
 * an arc is going. When the mesh arrives it drops in underneath with no other
 * change: both are placed from the same numbers.
 *
 * Source is Z-up and three.js is Y-up. Rather than transform every coordinate
 * on the way in, the scene keeps Source coordinates verbatim and tells the
 * camera that up is +Z — see lib/utility3d.
 */

const SELECTED_COLOUR = "#ffffff";

// ---------------------------------------------------------------- geometry

/**
 * The map's collision hull as a flat grey solid.
 *
 * Suspends on the fetch. A map with no mesh exported yet throws, which the
 * boundary above turns into "no geometry" rather than a broken page — an
 * absent map is the normal state until somebody exports one.
 */
function MapGeometry({ map, onLoad }: { map: string; onLoad: (m: MapMesh) => void }) {
  // useLoader cannot infer through a custom Loader subclass, so the type is
  // asserted once here rather than at each of its three uses below.
  const mesh = useLoader(MeshLoader, meshUrl(map)) as unknown as MapMesh;

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
    g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    // The physics hull carries no normals — it is a triangle soup — so they are
    // computed once here. Without them the greybox is uniformly unlit and you
    // cannot tell a wall from a floor.
    g.computeVertexNormals();
    return g;
  }, [mesh]);

  useEffect(() => {
    onLoad(mesh);
    return () => geometry.dispose();
  }, [mesh, geometry, onLoad]);

  return (
    <group>
      <mesh geometry={geometry}>
        <meshLambertMaterial color="#8d8f96" side={THREE.DoubleSide} />
      </mesh>
      {/* A wireframe over the solid: a greybox with no edges reads as a blob,
          and the edges are what make a doorway legible as a doorway. */}
      <mesh geometry={geometry}>
        <meshBasicMaterial color="#5b5e66" wireframe transparent opacity={0.16} />
      </mesh>
    </group>
  );
}

/** three.js loader shim, so the mesh can go through R3F's suspense cache. */
class MeshLoader extends THREE.Loader {
  load(
    url: string,
    onLoad: (m: MapMesh) => void,
    _onProgress?: (e: ProgressEvent) => void,
    onError?: (e: unknown) => void,
  ) {
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`no mesh for this map (${res.status})`);
        return res.arrayBuffer();
      })
      .then((buf) => onLoad(decodeMapMesh(buf)))
      .catch((err) => onError?.(err));
  }
}

/** The radar image, laid flat at the world position its calibration describes. */
function RadarFloor({ map, z }: { map: string; z: number }) {
  const cfg = MAPS[map];
  const plane = radarPlane(cfg);
  const texture = useLoader(THREE.TextureLoader, `/radars/${map}.png`);

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    // The radar is a single sheet — repeating it at the edges would tile the
    // map, which looks like geometry that is not there.
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
  }, [texture]);

  if (!plane) return null;

  return (
    <mesh position={[plane.centre[0], plane.centre[1], z]}>
      <planeGeometry args={[plane.size, plane.size]} />
      <meshBasicMaterial map={texture} transparent opacity={0.9} depthWrite={false} />
    </mesh>
  );
}

// ------------------------------------------------------------------- arcs

function Arc({
  lineup,
  path,
  selected,
  onSelect,
}: {
  lineup: Lineup;
  path: PathSample[];
  selected: boolean;
  onSelect: () => void;
}) {
  const points = useMemo(
    () => path.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
    [path],
  );

  const colour = selected ? SELECTED_COLOUR : (UTIL_COLOUR[lineup.utility] ?? "#9aa0a6");

  return (
    <group>
      <Line
        points={points}
        color={colour}
        lineWidth={selected ? 3.5 : 1.6}
        transparent
        opacity={selected ? 1 : 0.5}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      />
      {/* Where you stand and where it lands. Spheres rather than sprites so
          they sit in the depth buffer and go behind walls like everything
          else — a marker that shows through geometry is a marker you cannot
          use to judge whether you have line of sight. */}
      <mesh position={points[0]}>
        <sphereGeometry args={[selected ? 9 : 6, 12, 12]} />
        <meshBasicMaterial color={colour} />
      </mesh>
      <mesh position={points[points.length - 1]}>
        <sphereGeometry args={[selected ? 14 : 9, 16, 16]} />
        <meshBasicMaterial color={colour} transparent opacity={0.75} />
      </mesh>
    </group>
  );
}

/** The moving dot, at the position the recording says it was at time t. */
function Projectile({ path, t }: { path: PathSample[]; t: number }) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const at = sampleAt(path, path.length ? path[0][3] + t : 0);
    if (at && ref.current) ref.current.position.set(at[0], at[1], at[2]);
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[7, 16, 16]} />
      <meshBasicMaterial color="#ffffff" />
    </mesh>
  );
}

// ------------------------------------------------------------------ scene

function Rig({
  bounds,
}: {
  bounds: { min: [number, number, number]; max: [number, number, number] };
}) {
  const { camera } = useThree();
  const controls = useRef<any>(null);

  // Reframed when the map changes, not on every render: moving the camera
  // under someone who is in the middle of looking at something is worse than
  // starting them somewhere imperfect.
  const key = bounds.min.join() + bounds.max.join();
  useEffect(() => {
    const framed = frameBounds(bounds.min, bounds.max);
    camera.position.set(...framed.position);
    camera.up.set(0, 0, 1);
    camera.lookAt(...framed.target);
    if (controls.current) {
      controls.current.target.set(...framed.target);
      controls.current.update();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, camera]);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      // Stops short of straight down and of going under the floor: both put the
      // camera somewhere with no usable frame of reference.
      minPolarAngle={0.12}
      maxPolarAngle={Math.PI / 2 - 0.02}
      maxDistance={30000}
    />
  );
}

export default function Utility3D({
  map,
  lineups,
  selectedId,
  onSelect,
}: {
  map: string;
  lineups: Lineup[];
  selectedId: number | null;
  onSelect: (l: Lineup) => void;
}) {
  const [mesh, setMesh] = useState<MapMesh | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);

  // A new map's mesh is a different mesh; keeping the old one would frame the
  // camera on the previous map.
  useEffect(() => setMesh(null), [map]);

  const drawable = useMemo(
    () =>
      lineups
        .map((l) => ({ lineup: l, path: cleanPath(l.path as PathSample[] | null) }))
        .filter((d) => d.path.length >= 2),
    [lineups],
  );

  const selected = useMemo(
    () => drawable.find((d) => d.lineup.id === selectedId) ?? null,
    [drawable, selectedId],
  );

  const duration = selected ? pathDuration(selected.path) : 0;

  // Playback. Wall-clock rather than frame-counted, so a slow frame does not
  // slow the grenade down — the arc is a recording of something that took a
  // fixed length of time.
  useEffect(() => {
    if (!playing || duration <= 0) return;

    let frame = 0;
    const started = performance.now() - t * 1000;
    const tick = () => {
      const elapsed = (performance.now() - started) / 1000;
      if (elapsed >= duration) {
        setT(duration);
        setPlaying(false);
        return;
      }
      setT(elapsed);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, duration]);

  useEffect(() => {
    setT(0);
    setPlaying(false);
  }, [selectedId]);

  const bounds = useMemo(() => {
    if (mesh) return mesh.bounds;
    const cfg = MAPS[map];
    return cfg ? radarBounds(cfg) : null;
  }, [mesh, map]);

  // The radar sits at the lowest point anything on this map is known to be,
  // so it reads as the ground rather than as a sheet floating through it.
  const floorZ = useMemo(() => {
    if (mesh) return mesh.bounds.min[2];
    const zs = lineups.map((l) => l.stand.z).filter(Number.isFinite);
    return zs.length ? Math.min(...zs) - 64 : 0;
  }, [mesh, lineups]);

  if (!bounds) {
    return (
      <div className="ux3d-empty">
        <p className="muted">This map has no radar calibration, so there is nothing to place things against yet.</p>
      </div>
    );
  }

  return (
    <div className="ux3d">
      <Canvas
        dpr={[1, 2]}
        // 55° matches what frameBounds assumes when it works out the distance.
        camera={{ fov: 55, near: 4, far: 60000, up: [0, 0, 1] }}
        onCreated={({ scene }) => {
          scene.background = new THREE.Color("#0d0f13");
        }}
      >
        <ambientLight intensity={1.1} />
        <directionalLight position={[1, 0.6, 2]} intensity={1.5} />

        <Rig bounds={bounds} />

        <Suspense fallback={null}>
          <RadarFloor map={map} z={floorZ} />
        </Suspense>
        <Suspense fallback={null}>
          <MapGeometry map={map} onLoad={setMesh} />
        </Suspense>

        {drawable.map((d) => (
          <Arc
            key={d.lineup.id}
            lineup={d.lineup}
            path={d.path}
            selected={d.lineup.id === selectedId}
            onSelect={() => onSelect(d.lineup)}
          />
        ))}

        {selected && <Projectile path={selected.path} t={t} />}
      </Canvas>

      <div className="ux3d-bar">
        {drawable.length === 0 ? (
          <span className="muted">
            No recorded arcs on this map yet. Capturing a lineup in game records one; imported and
            mined lineups do not have one until the importer samples the flight.
          </span>
        ) : selected ? (
          <>
            <button className="btn btn-secondary" onClick={() => setPlaying((p) => !p)} disabled={duration <= 0}>
              {playing ? "Pause" : t >= duration && duration > 0 ? "Replay" : "Play"}
            </button>
            <input
              type="range"
              min={0}
              max={Math.max(duration, 0.01)}
              step={0.01}
              value={t}
              onChange={(e) => {
                setPlaying(false);
                setT(Number(e.target.value));
              }}
              aria-label="Time through the throw"
            />
            <span className="ux3d-time">
              {t.toFixed(2)}s / {duration.toFixed(2)}s
            </span>
          </>
        ) : (
          <span className="muted">
            {drawable.length} recorded arc{drawable.length === 1 ? "" : "s"} — click one to scrub through it.
          </span>
        )}

        {!mesh && (
          <span className="ux3d-note muted">
            Radar floor — no map geometry exported for {map} yet.
          </span>
        )}
      </div>
    </div>
  );
}
