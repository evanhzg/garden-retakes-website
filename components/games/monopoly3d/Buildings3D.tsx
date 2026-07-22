"use client";

import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Layout } from "./layout";
import { SURFACE_Y, TILE_D, HOUSE_COLOR, HOTEL_COLOR } from "./theme";

export type BuildingStyle = "classic" | "modern" | "tower" | "tent";

// One building that scales in from nothing when it mounts.
function Building({
  position, scale, color, roofColor, style,
}: {
  position: [number, number, number];
  scale: number;            // 1 = house, ~1.7 = hotel
  color: string;
  roofColor: string;
  style: BuildingStyle;
}) {
  const ref = useRef<THREE.Group>(null);
  const s = useRef(0);
  useFrame((_, dt) => {
    if (!ref.current) return;
    if (s.current < 1) {
      s.current = Math.min(1, s.current + dt * 4);
      const e = 1 - Math.pow(1 - s.current, 3);
      ref.current.scale.setScalar(e < 1 ? e * (1.12 - 0.12 * e) : 1);
    }
  });

  const bw = 0.16 * scale;
  let body: React.ReactNode;
  if (style === "tower") {
    body = (
      <mesh castShadow position={[0, 0.16 * scale, 0]}>
        <boxGeometry args={[bw * 0.7, 0.34 * scale, bw * 0.7]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.2} />
      </mesh>
    );
  } else if (style === "modern") {
    body = (
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
  } else if (style === "tent") {
    body = (
      <mesh castShadow position={[0, 0.12 * scale, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[bw * 0.85, 0.26 * scale, 4]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
    );
  } else {
    // classic: box + pyramid roof
    body = (
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

  return <group ref={ref} position={position} scale={0}>{body}</group>;
}

export function Buildings3D({ space, layout, boardMeta }: { space: any; layout: Layout; boardMeta: any }) {
  if (space.type !== "property" || !space.houses) return null;
  const [cx, cz] = layout.center(space.id);
  const { inward, along } = layout.dirs(space.id);
  const inset = TILE_D * 0.28;
  const style: BuildingStyle = space.buildingStyle || boardMeta?.theme?.buildingStyle || "classic";

  const worldAt = (a: number): [number, number, number] => [
    cx + inward[0] * inset + along[0] * a,
    SURFACE_Y,
    cz + inward[1] * inset + along[1] * a,
  ];

  if (space.houses >= 5) {
    return <Building key="hotel" position={worldAt(0)} scale={1.7} color={HOTEL_COLOR} roofColor="#7f1010" style={style} />;
  }
  const n = space.houses;
  const gap = 0.23;
  return (
    <>
      {Array.from({ length: n }).map((_, k) => (
        <Building key={k} position={worldAt((k - (n - 1) / 2) * gap)} scale={1} color={HOUSE_COLOR} roofColor="#0a3d1c" style={style} />
      ))}
    </>
  );
}
