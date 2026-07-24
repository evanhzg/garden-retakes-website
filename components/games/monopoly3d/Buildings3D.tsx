"use client";

import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Layout } from "./layout";
import { SURFACE_Y, TILE_D, HOUSE_COLOR, HOTEL_COLOR } from "./theme";

export type BuildingStyle = "classic" | "modern" | "tower" | "tent";

// Scale-in wrapper shared by every placed object (houses, gardens, flags).
function PopIn({ position, children }: { position: [number, number, number]; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const s = useRef(0);
  useFrame((_, dt) => {
    if (!ref.current || s.current >= 1) return;
    s.current = Math.min(1, s.current + dt * 4);
    const e = 1 - Math.pow(1 - s.current, 3);
    ref.current.scale.setScalar(e < 1 ? e * (1.12 - 0.12 * e) : 1);
  });
  return <group ref={ref} position={position} scale={0}>{children}</group>;
}

// A unit gable (ridged) roof — a triangular prism, base 1×1, height 1, ridge
// running front↔back so the triangular gable end faces the front (door side).
const _roofShape = new THREE.Shape();
_roofShape.moveTo(-0.5, 0);
_roofShape.lineTo(0.5, 0);
_roofShape.lineTo(0, 1);
_roofShape.closePath();
const GABLE_ROOF_GEOM = new THREE.ExtrudeGeometry(_roofShape, { depth: 1, bevelEnabled: false });
GABLE_ROOF_GEOM.translate(0, 0, -0.5);
GABLE_ROOF_GEOM.computeVertexNormals();

const WINDOW_MAT = { color: "#bfe3f5", emissive: "#7fb8d8", emissiveIntensity: 0.22, roughness: 0.3, metalness: 0.35 } as const;

// A cute little low-poly cottage: walls, a pitched gable roof, a door, two side
// windows and a chimney. Roof colour carries the house/hotel colour coding.
function HouseModel({ scale, roofColor }: { scale: number; roofColor: string }) {
  const w = 0.2 * scale, wh = 0.17 * scale, d = 0.2 * scale, rh = 0.15 * scale;
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, wh / 2, 0]}>
        <boxGeometry args={[w, wh, d]} />
        <meshStandardMaterial color="#efe7d4" roughness={0.78} />
      </mesh>
      <mesh castShadow geometry={GABLE_ROOF_GEOM} position={[0, wh, 0]} scale={[w * 1.14, rh, d * 1.14]}>
        <meshStandardMaterial color={roofColor} roughness={0.62} />
      </mesh>
      {/* door on the front gable end */}
      <mesh position={[0, wh * 0.34, d / 2 + 0.003]}>
        <boxGeometry args={[w * 0.34, wh * 0.62, 0.02]} />
        <meshStandardMaterial color="#6b4423" roughness={0.6} />
      </mesh>
      {/* windows on the long sides */}
      <mesh position={[w / 2 + 0.002, wh * 0.58, 0]}>
        <boxGeometry args={[0.02, wh * 0.34, d * 0.36]} />
        <meshStandardMaterial {...WINDOW_MAT} />
      </mesh>
      <mesh position={[-w / 2 - 0.002, wh * 0.58, 0]}>
        <boxGeometry args={[0.02, wh * 0.34, d * 0.36]} />
        <meshStandardMaterial {...WINDOW_MAT} />
      </mesh>
      {/* chimney */}
      <mesh castShadow position={[w * 0.26, wh + rh * 0.55, -d * 0.2]}>
        <boxGeometry args={[0.05 * scale, 0.13 * scale, 0.05 * scale]} />
        <meshStandardMaterial color="#8a5a3a" roughness={0.72} />
      </mesh>
    </group>
  );
}

// A grander building for a fully-developed property (a "hotel"): a wider block
// with rows of windows, a red hip roof and an entrance awning.
function HotelModel({ scale }: { scale: number }) {
  const w = 0.36 * scale, wh = 0.3 * scale, d = 0.26 * scale;
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, wh / 2, 0]}>
        <boxGeometry args={[w, wh, d]} />
        <meshStandardMaterial color="#f0e9d8" roughness={0.72} />
      </mesh>
      {/* red hip roof (a shallow 4-sided pyramid) */}
      <mesh castShadow position={[0, wh + 0.06 * scale, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[w * 0.82, 0.14 * scale, 4]} />
        <meshStandardMaterial color="#c0392b" roughness={0.55} />
      </mesh>
      {/* window grid on the front */}
      {[-1, 0, 1].map((cx) => [0, 1].map((cy) => (
        <mesh key={`${cx}-${cy}`} position={[cx * w * 0.28, wh * 0.34 + cy * wh * 0.34, d / 2 + 0.003]}>
          <boxGeometry args={[w * 0.15, wh * 0.2, 0.02]} />
          <meshStandardMaterial {...WINDOW_MAT} />
        </mesh>
      )))}
      {/* entrance awning */}
      <mesh position={[0, wh * 0.15, d / 2 + 0.006]}>
        <boxGeometry args={[w * 0.26, wh * 0.26, 0.02]} />
        <meshStandardMaterial color="#7a1e14" roughness={0.6} />
      </mesh>
    </group>
  );
}

function BuildingBody({ scale, color, roofColor, style }: { scale: number; color: string; roofColor: string; style: BuildingStyle }) {
  const bw = 0.2 * scale;
  if (style === "classic") return <HouseModel scale={scale} roofColor={roofColor} />;
  if (style === "tower") {
    return (
      <mesh castShadow position={[0, 0.16 * scale, 0]}>
        <boxGeometry args={[bw * 0.7, 0.34 * scale, bw * 0.7]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.2} />
      </mesh>
    );
  }
  if (style === "modern") {
    return (
      <>
        <mesh castShadow position={[0, 0.09 * scale, 0]}>
          <boxGeometry args={[bw, 0.18 * scale, bw]} />
          <meshStandardMaterial color={color} roughness={0.35} metalness={0.25} />
        </mesh>
        <mesh castShadow position={[0, 0.2 * scale, 0]}>
          <boxGeometry args={[bw * 1.05, 0.03 * scale, bw * 1.05]} />
          <meshStandardMaterial color={roofColor} roughness={0.4} />
        </mesh>
      </>
    );
  }
  if (style === "tent") {
    return (
      <mesh castShadow position={[0, 0.12 * scale, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[bw * 0.85, 0.26 * scale, 4]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
    );
  }
  return (
    <>
      <mesh castShadow position={[0, 0.07 * scale, 0]}>
        <boxGeometry args={[bw, 0.14 * scale, bw]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.1} />
      </mesh>
      <mesh castShadow position={[0, 0.14 * scale + 0.055 * scale, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[bw * 0.72, 0.11 * scale, 4]} />
        <meshStandardMaterial color={roofColor} roughness={0.5} />
      </mesh>
    </>
  );
}

// Business-Tour style building: a single glossy tower that grows taller with the
// development level (1..5), tinted in the owner's colour.
function BTTower({ level, color }: { level: number; color: string }) {
  const h = 0.32 + Math.min(level, 5) * 0.24;
  const w = 0.32;
  return (
    <group>
      <mesh castShadow position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, w]} />
        <meshStandardMaterial color={color} metalness={0.6} roughness={0.24} emissive={new THREE.Color(color)} emissiveIntensity={0.14} />
      </mesh>
      {/* glowing crown */}
      <mesh position={[0, h + 0.04, 0]} castShadow>
        <boxGeometry args={[w * 0.55, 0.08, w * 0.55]} />
        <meshStandardMaterial color="#ffd84d" metalness={0.8} roughness={0.2} emissive="#ffd84d" emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

// A little garden shown on an owned-but-undeveloped property: a tree, a couple
// of shrubs and a flag in the owner's colour.
function GardenDecor({ ownerColor }: { ownerColor: string }) {
  return (
    <group scale={1.3}>
      <mesh castShadow position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.02, 0.028, 0.1, 6]} />
        <meshStandardMaterial color="#6b4423" roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0, 0.15, 0]}>
        <coneGeometry args={[0.09, 0.15, 7]} />
        <meshStandardMaterial color="#2e8b57" roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0, 0.23, 0]}>
        <coneGeometry args={[0.06, 0.1, 7]} />
        <meshStandardMaterial color="#3aa76d" roughness={0.7} />
      </mesh>
      <mesh castShadow position={[-0.15, 0.03, 0.05]}>
        <sphereGeometry args={[0.05, 8, 6]} />
        <meshStandardMaterial color="#3aa76d" roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0.14, 0.028, -0.05]}>
        <sphereGeometry args={[0.045, 8, 6]} />
        <meshStandardMaterial color="#2e8b57" roughness={0.8} />
      </mesh>
      {/* owner flag */}
      <mesh position={[0.15, 0.12, 0.1]}>
        <cylinderGeometry args={[0.006, 0.006, 0.24, 4]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh position={[0.192, 0.2, 0.1]}>
        <planeGeometry args={[0.08, 0.05]} />
        <meshStandardMaterial color={ownerColor} side={THREE.DoubleSide} emissive={new THREE.Color(ownerColor)} emissiveIntensity={0.25} />
      </mesh>
    </group>
  );
}

// Small owner flag for owned rail / utility tiles.
function OwnerFlag({ ownerColor }: { ownerColor: string }) {
  return (
    <>
      <mesh position={[0, 0.13, 0]}>
        <cylinderGeometry args={[0.007, 0.007, 0.26, 5]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0.05, 0.22, 0]}>
        <planeGeometry args={[0.1, 0.06]} />
        <meshStandardMaterial color={ownerColor} side={THREE.DoubleSide} emissive={new THREE.Color(ownerColor)} emissiveIntensity={0.3} />
      </mesh>
    </>
  );
}

export function Buildings3D({ space, layout, boardMeta, ownerColor, bt }: { space: any; layout: Layout; boardMeta: any; ownerColor: string | null; bt?: boolean }) {
  const [cx, cz] = layout.center(space.id);
  const { inward, along } = layout.dirs(space.id);
  const worldAt = (a: number, inset: number): [number, number, number] => [
    cx + inward[0] * inset + along[0] * a,
    SURFACE_Y,
    cz + inward[1] * inset + along[1] * a,
  ];

  // BT style: developed properties become one glossy tower that grows with level.
  if (bt && space.type === "property" && space.houses) {
    return <PopIn position={worldAt(0, TILE_D * 0.28)}><BTTower level={space.houses} color={ownerColor || "#7dd3fc"} /></PopIn>;
  }

  // Houses / hotel take precedence on developed properties.
  if (space.type === "property" && space.houses) {
    const style: BuildingStyle = space.buildingStyle || boardMeta?.theme?.buildingStyle || "classic";
    const inset = TILE_D * 0.28;
    if (space.houses >= 5) {
      return (
        <PopIn position={worldAt(0, inset)}>
          {style === "classic"
            ? <HotelModel scale={1.15} />
            : <BuildingBody scale={1.9} color={HOTEL_COLOR} roofColor="#7f1010" style={style} />}
        </PopIn>
      );
    }
    const n = space.houses, gap = 0.26;
    return (
      <>
        {Array.from({ length: n }).map((_, k) => (
          <PopIn key={k} position={worldAt((k - (n - 1) / 2) * gap, inset)}>
            <BuildingBody scale={1} color={HOUSE_COLOR} roofColor="#2e8b57" style={style} />
          </PopIn>
        ))}
      </>
    );
  }

  // Owned but undeveloped → a decoration so the tile reads as claimed. Kept on
  // the inner half (toward centre) so pawns, which sit on the outer half, never
  // overlap it.
  if (ownerColor && !space.mortgaged) {
    if (space.type === "property") return <PopIn position={worldAt(0, TILE_D * 0.24)}><GardenDecor ownerColor={ownerColor} /></PopIn>;
    if (space.type === "rail" || space.type === "util") return <PopIn position={worldAt(0, TILE_D * 0.24)}><OwnerFlag ownerColor={ownerColor} /></PopIn>;
  }
  return null;
}
