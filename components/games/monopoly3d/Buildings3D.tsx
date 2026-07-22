"use client";

import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { tileCenter, tileDirs } from "./layout";
import { SURFACE_Y, TILE_D, HOUSE_COLOR, HOTEL_COLOR } from "./theme";

// One building that scales in from nothing when it mounts (so a newly built
// house / hotel pops onto the board).
function Building({
  position, body, roof, color, roofColor,
}: {
  position: [number, number, number];
  body: [number, number, number];
  roof: number;
  color: string;
  roofColor: string;
}) {
  const ref = useRef<THREE.Group>(null);
  const s = useRef(0);
  useFrame((_, dt) => {
    if (!ref.current) return;
    if (s.current < 1) {
      s.current = Math.min(1, s.current + dt * 4);
      const e = 1 - Math.pow(1 - s.current, 3); // ease-out
      const pop = e < 1 ? e * (1.12 - 0.12 * e) : 1; // slight overshoot
      ref.current.scale.setScalar(pop);
    }
  });
  return (
    <group ref={ref} position={position} scale={0}>
      <mesh castShadow position={[0, body[1] / 2, 0]}>
        <boxGeometry args={body} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.1} />
      </mesh>
      <mesh castShadow position={[0, body[1] + roof / 2, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[body[0] * 0.72, roof, 4]} />
        <meshStandardMaterial color={roofColor} roughness={0.5} />
      </mesh>
    </group>
  );
}

export function Buildings3D({ space }: { space: any }) {
  if (space.type !== "property" || !space.houses) return null;
  const [cx, cz] = tileCenter(space.id);
  const { inward, along } = tileDirs(space.id);
  const inset = TILE_D * 0.28;

  const worldAt = (a: number): [number, number, number] => [
    cx + inward[0] * inset + along[0] * a,
    SURFACE_Y,
    cz + inward[1] * inset + along[1] * a,
  ];

  if (space.houses >= 5) {
    // Hotel
    return (
      <Building
        key="hotel"
        position={worldAt(0)}
        body={[0.36, 0.2, 0.22]}
        roof={0.12}
        color={HOTEL_COLOR}
        roofColor="#7f1010"
      />
    );
  }

  const n = space.houses;
  const gap = 0.23;
  return (
    <>
      {Array.from({ length: n }).map((_, k) => (
        <Building
          key={k}
          position={worldAt((k - (n - 1) / 2) * gap)}
          body={[0.16, 0.14, 0.16]}
          roof={0.11}
          color={HOUSE_COLOR}
          roofColor="#0a3d1c"
        />
      ))}
    </>
  );
}
