"use client";

import React, { useMemo } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { Lang } from "@/components/games/monopolyData";
import { tileTransform } from "./layout";
import { tileFaceTexture } from "./tileFaceTexture";
import { TILE_H, resolveTheme } from "./theme";

type Props = {
  space: any;
  lang: Lang;
  boardMeta: any;
  ownerColor: string | null;
  onSelect: (id: number) => void;
  onHover: (space: any, e: ThreeEvent<PointerEvent>) => void;
  onHoverEnd: () => void;
  // editor mode
  editable?: boolean;
  selected?: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  accent?: string;
  onDragStart?: (id: number, e: ThreeEvent<PointerEvent>) => void;
  onDragMove?: (e: ThreeEvent<PointerEvent>) => void;
  onDragEnd?: (e: ThreeEvent<PointerEvent>) => void;
};

function Tile3DImpl(props: Props) {
  const {
    space, lang, boardMeta, ownerColor, onSelect, onHover, onHoverEnd,
    editable, selected, dragging, dropTarget, accent = "#22c55e",
    onDragStart, onDragMove, onDragEnd,
  } = props;

  const perSide = boardMeta?.perSide ?? 9;
  const t = useMemo(() => tileTransform(space.id, perSide), [space.id, perSide]);
  const [w, d] = t.size;
  const isCorner = space.type === "corner";
  const clickable = ["property", "rail", "util"].includes(space.type);
  const face = useMemo(
    () => tileFaceTexture(space, lang, boardMeta),
    // recompute when any face-affecting field changes (live editing)
    [space.id, lang, boardMeta?.boardId, space.type, space.name, space.group, space.price, space.icon, boardMeta?.theme]
  );
  const theme = useMemo(() => resolveTheme(boardMeta?.theme), [boardMeta?.theme]);

  const highlight = dragging ? accent : selected ? accent : dropTarget ? accent : ownerColor;
  const highlightGeo = useMemo(
    () => (highlight ? new THREE.EdgesGeometry(new THREE.BoxGeometry(w * 0.99, TILE_H * 0.7, d * 0.99)) : null),
    [highlight, w, d]
  );

  const emissiveColor = highlight || "#000000";
  const emissiveIntensity = dragging ? 0.6 : selected ? 0.4 : dropTarget ? 0.28 : (ownerColor && !space.mortgaged ? 0.16 : 0);

  const liftY = dragging ? 0.6 : 0;

  return (
    <group position={[t.position[0], liftY, t.position[2]]} rotation-y={t.yaw}>
      <mesh
        castShadow
        receiveShadow
        position={[0, TILE_H / 2, 0]}
        onClick={!editable && clickable ? (e) => { e.stopPropagation(); onSelect(space.id); } : undefined}
        onPointerDown={editable ? (e) => {
          e.stopPropagation();
          onSelect(space.id);
          if (!isCorner && onDragStart) {
            try { (e.target as any).setPointerCapture(e.pointerId); } catch {}
            onDragStart(space.id, e);
          }
        } : undefined}
        onPointerMove={
          editable
            ? (dragging && onDragMove ? (e) => onDragMove(e) : undefined)
            : (!isCorner ? (e) => onHover(space, e) : undefined)
        }
        onPointerUp={editable ? (e) => {
          try { (e.target as any).releasePointerCapture(e.pointerId); } catch {}
          onDragEnd?.(e);
        } : undefined}
        onPointerOver={!editable && !isCorner ? (e) => { e.stopPropagation(); onHover(space, e); } : undefined}
        onPointerOut={!editable && !isCorner ? () => onHoverEnd() : undefined}
      >
        <boxGeometry args={[w, TILE_H, d]} />
        <meshStandardMaterial
          color={space.mortgaged ? "#9aa0a6" : isCorner ? theme.tileBaseCorner : theme.tileBase}
          roughness={0.72}
          metalness={0.06}
          emissive={new THREE.Color(emissiveColor)}
          emissiveIntensity={emissiveIntensity}
        />
      </mesh>

      {face && (
        <mesh position={[0, TILE_H + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[w * 0.985, d * 0.985]} />
          <meshBasicMaterial map={face} transparent opacity={space.mortgaged ? 0.45 : 1} />
        </mesh>
      )}

      {highlightGeo && (
        <lineSegments geometry={highlightGeo} position={[0, TILE_H * 0.55, 0]}>
          <lineBasicMaterial color={highlight!} toneMapped={false} />
        </lineSegments>
      )}
    </group>
  );
}

export const Tile3D = React.memo(Tile3DImpl);
