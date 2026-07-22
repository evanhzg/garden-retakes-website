"use client";

import React, { useMemo } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { Lang } from "@/components/games/monopolyData";
import { tileTransform } from "./layout";
import { tileFaceTexture } from "./tileFaceTexture";
import { TILE_H, PALETTE } from "./theme";

type Props = {
  space: any;
  lang: Lang;
  ownerColor: string | null;
  onSelect: (id: number) => void;
  onHover: (space: any, e: ThreeEvent<PointerEvent>) => void;
  onHoverEnd: () => void;
};

function Tile3DImpl({ space, lang, ownerColor, onSelect, onHover, onHoverEnd }: Props) {
  const t = useMemo(() => tileTransform(space.id), [space.id]);
  const [w, d] = t.size;
  const isCorner = space.type === "corner";
  const clickable = ["property", "rail", "util"].includes(space.type);
  const face = useMemo(() => tileFaceTexture(space, lang), [space.id, lang]);

  // Owner-colour outline around the tile top (only when owned).
  const outline = useMemo(
    () => (ownerColor ? new THREE.EdgesGeometry(new THREE.BoxGeometry(w * 0.99, TILE_H * 0.7, d * 0.99)) : null),
    [ownerColor, w, d]
  );

  const owned = !!ownerColor && !space.mortgaged;

  return (
    <group position={t.position} rotation-y={t.yaw}>
      <mesh
        castShadow
        receiveShadow
        position={[0, TILE_H / 2, 0]}
        onClick={clickable ? (e) => { e.stopPropagation(); onSelect(space.id); } : undefined}
        onPointerOver={!isCorner ? (e) => { e.stopPropagation(); onHover(space, e); } : undefined}
        onPointerMove={!isCorner ? (e) => onHover(space, e) : undefined}
        onPointerOut={!isCorner ? () => onHoverEnd() : undefined}
      >
        <boxGeometry args={[w, TILE_H, d]} />
        <meshStandardMaterial
          color={space.mortgaged ? "#9aa0a6" : isCorner ? PALETTE.tileBaseCorner : PALETTE.tileBase}
          roughness={0.72}
          metalness={0.06}
          emissive={owned ? new THREE.Color(ownerColor!) : new THREE.Color("#000000")}
          emissiveIntensity={owned ? 0.16 : 0}
        />
      </mesh>

      {/* localized top-face label */}
      {face && (
        <mesh position={[0, TILE_H + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[w * 0.985, d * 0.985]} />
          <meshBasicMaterial map={face} transparent opacity={space.mortgaged ? 0.45 : 1} />
        </mesh>
      )}

      {outline && (
        <lineSegments geometry={outline} position={[0, TILE_H * 0.55, 0]}>
          <lineBasicMaterial color={ownerColor!} toneMapped={false} />
        </lineSegments>
      )}
    </group>
  );
}

export const Tile3D = React.memo(Tile3DImpl);
