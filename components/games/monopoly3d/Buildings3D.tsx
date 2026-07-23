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

function BuildingBody({ scale, color, roofColor, style }: { scale: number; color: string; roofColor: string; style: BuildingStyle }) {
  const bw = 0.16 * scale;
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

// A little garden shown on an owned-but-undeveloped property: a tree, a couple
// of shrubs and a flag in the owner's colour.
function GardenDecor({ ownerColor }: { ownerColor: string }) {
  return (
    <>
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
    </>
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

export function Buildings3D({ space, layout, boardMeta, ownerColor }: { space: any; layout: Layout; boardMeta: any; ownerColor: string | null }) {
  const [cx, cz] = layout.center(space.id);
  const { inward, along } = layout.dirs(space.id);
  const worldAt = (a: number, inset: number): [number, number, number] => [
    cx + inward[0] * inset + along[0] * a,
    SURFACE_Y,
    cz + inward[1] * inset + along[1] * a,
  ];

  // Houses / hotel take precedence on developed properties.
  if (space.type === "property" && space.houses) {
    const style: BuildingStyle = space.buildingStyle || boardMeta?.theme?.buildingStyle || "classic";
    const inset = TILE_D * 0.28;
    if (space.houses >= 5) {
      return <PopIn position={worldAt(0, inset)}><BuildingBody scale={1.7} color={HOTEL_COLOR} roofColor="#7f1010" style={style} /></PopIn>;
    }
    const n = space.houses, gap = 0.23;
    return (
      <>
        {Array.from({ length: n }).map((_, k) => (
          <PopIn key={k} position={worldAt((k - (n - 1) / 2) * gap, inset)}>
            <BuildingBody scale={1} color={HOUSE_COLOR} roofColor="#0a3d1c" style={style} />
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
