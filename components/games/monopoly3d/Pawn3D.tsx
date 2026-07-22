"use client";

import React, { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { tileCenter, pawnSlotOffset, pathBetween } from "./layout";
import { SURFACE_Y } from "./theme";

// Classic pawn silhouette (radius, height) revolved into a solid.
const PROFILE = [
  [0.0, 0.0], [0.16, 0.0], [0.16, 0.035], [0.075, 0.06], [0.055, 0.15],
  [0.10, 0.21], [0.055, 0.25], [0.11, 0.31], [0.115, 0.36], [0.07, 0.41], [0.0, 0.43],
].map(([x, y]) => new THREE.Vector2(x, y));
const PAWN_GEOM = new THREE.LatheGeometry(PROFILE, 28);
PAWN_GEOM.computeVertexNormals();

type Props = {
  position: number;      // tile id
  color: string;
  active: boolean;
  slotIndex: number;
};

function Pawn3DImpl({ position, color, active, slotIndex }: Props) {
  const ref = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);

  // animation state (refs so we don't re-render every frame)
  const path = useRef<number[]>([position]);
  const u = useRef(1);          // 0..1 progress across the current path
  const dur = useRef(0.0001);
  const hopH = useRef(0.22);
  const lastPos = useRef(position);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      lastPos.current = position;
      path.current = [position];
      u.current = 1;
      return;
    }
    if (position === lastPos.current) return;
    const p = pathBetween(lastPos.current, position);
    const steps = p.length - 1;
    const forward = (position - lastPos.current + 40) % 40;
    const teleport = p.length === 2 && forward !== 1;
    path.current = p;
    u.current = 0;
    dur.current = teleport ? 0.55 : Math.max(0.14, steps / 7);
    hopH.current = teleport ? 1.1 : 0.24;
    lastPos.current = position;
  }, [position]);

  useFrame((state, dt) => {
    const g = ref.current;
    if (!g) return;
    const p = path.current;
    const last = p.length - 1;

    if (u.current < 1) u.current = Math.min(1, u.current + dt / dur.current);

    const idxF = u.current * last;
    const i = Math.min(Math.floor(idxF), Math.max(0, last - 1));
    const f = last === 0 ? 0 : idxF - i;
    const a = tileCenter(p[i]);
    const b = tileCenter(p[Math.min(i + 1, last)]);
    const off = pawnSlotOffset(position, slotIndex);

    const x = a[0] + (b[0] - a[0]) * f + off[0];
    const z = a[1] + (b[1] - a[1]) * f + off[1];
    let y = SURFACE_Y;
    if (u.current < 1) {
      // hop arc within each unit segment (walk) or one big arc (teleport)
      const segFrac = last <= 1 ? u.current : f;
      y += Math.sin(segFrac * Math.PI) * hopH.current;
      g.rotation.y += dt * 6; // spin a little while travelling
    } else if (active) {
      y += Math.abs(Math.sin(state.clock.elapsedTime * 3)) * 0.05; // idle bob for the current player
    }

    g.position.set(x, y, z);

    if (matRef.current) {
      const target = active ? 0.5 : 0;
      matRef.current.emissiveIntensity += (target - matRef.current.emissiveIntensity) * Math.min(1, dt * 6);
    }
  });

  return (
    <group ref={ref}>
      <mesh geometry={PAWN_GEOM} castShadow>
        <meshStandardMaterial
          ref={matRef}
          color={color}
          roughness={0.28}
          metalness={0.35}
          emissive={new THREE.Color(color)}
          emissiveIntensity={0}
        />
      </mesh>
      {/* soft contact disc so the pawn reads as grounded */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <circleGeometry args={[0.16, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.22} />
      </mesh>
    </group>
  );
}

export const Pawn3D = React.memo(Pawn3DImpl);
