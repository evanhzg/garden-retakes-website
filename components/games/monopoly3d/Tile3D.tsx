"use client";

import React, { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { Lang } from "@/components/games/monopolyData";
import type { TileXform } from "./layout";
import { tileFaceTexture } from "./tileFaceTexture";
import { TILE_H, resolveTheme } from "./theme";

const HOVER_LIFT = 0.12;

type Props = {
  space: any;
  lang: Lang;
  boardMeta: any;
  xform: TileXform;
  targetPos?: [number, number, number];
  followPoint?: [number, number] | null;
  ownerColor: string | null;
  onSelect: (id: number) => void;
  onHover: (space: any, e: ThreeEvent<PointerEvent>) => void;
  onHoverEnd: () => void;
  editable?: boolean;
  selected?: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  deleteMode?: boolean;
  accent?: string;
  onDragStart?: (id: number, e: ThreeEvent<PointerEvent>) => void;
  onDragMove?: (e: ThreeEvent<PointerEvent>) => void;
  onDragEnd?: (e: ThreeEvent<PointerEvent>) => void;
};

function Tile3DImpl(props: Props) {
  const {
    space, lang, boardMeta, xform, targetPos, followPoint, ownerColor, onSelect, onHover, onHoverEnd,
    editable, selected, dragging, dropTarget, deleteMode, accent = "#22c55e",
    onDragStart, onDragMove, onDragEnd,
  } = props;

  const [w, d] = xform?.size ?? [1, 1.32];
  const basePos = xform?.position ?? [0, 0, 0];
  const yaw = xform?.yaw ?? 0;
  const isCorner = space.type === "corner";
  const clickable = ["property", "rail", "util"].includes(space.type);
  const face = useMemo(
    () => tileFaceTexture(space, lang, boardMeta),
    [space.id, lang, boardMeta?.boardId, space.type, space.name, space.group, space.price, space.icon,
     space.color, space.faceStyle, space.effect?.type, boardMeta?.theme]
  );
  const theme = useMemo(() => resolveTheme(boardMeta?.theme), [boardMeta?.theme]);
  const domEl = useThree((s) => s.gl.domElement);

  const highlight = deleteMode ? "#ef4444" : dragging || selected || dropTarget ? accent : ownerColor;
  const highlightGeo = useMemo(
    () => (highlight ? new THREE.EdgesGeometry(new THREE.BoxGeometry(w * 0.99, TILE_H * 0.7, d * 0.99)) : null),
    [highlight, w, d]
  );
  const emissiveColor = highlight || "#000000";
  const emissiveIntensity = deleteMode ? 0.7 : dragging ? 0.6 : selected ? 0.4 : dropTarget ? 0.28
    : (ownerColor && !space.mortgaged ? 0.16 : 0);

  const liftY = dragging ? 0.65 : 0;
  const destX = followPoint ? followPoint[0] : (targetPos ?? basePos)[0];
  const destZ = followPoint ? followPoint[1] : (targetPos ?? basePos)[2];

  const groupRef = useRef<THREE.Group>(null);
  const inited = useRef(false);
  const hovered = useRef(false);

  useFrame((_, dt) => {
    const g = groupRef.current;
    if (!g) return;
    const targetY = dragging ? 0.65 : hovered.current ? HOVER_LIFT : 0;
    if (!inited.current) { g.position.set(destX, targetY, destZ); inited.current = true; return; }
    const dx = destX - g.position.x, dy = targetY - g.position.y, dz = destZ - g.position.z;
    // idle tiles cost almost nothing — skip the lerp when already settled.
    if (dx * dx + dy * dy + dz * dz < 1e-6 && !dragging) return;
    const k = Math.min(1, dt * 13);
    g.position.x += dx * k; g.position.y += dy * k; g.position.z += dz * k;
    g.rotation.z = dragging ? Math.sin(performance.now() / 200) * 0.05 : 0;
  });

  const setCursor = (c: string) => { if (domEl) domEl.style.cursor = c; };

  return (
    <group ref={groupRef} rotation-y={yaw}>
      <mesh
        castShadow
        receiveShadow
        position={[0, TILE_H / 2, 0]}
        onClick={!editable && clickable ? (e) => { e.stopPropagation(); onSelect(space.id); } : undefined}
        onPointerOver={(e) => {
          e.stopPropagation();
          hovered.current = true;
          setCursor(editable ? "grab" : clickable ? "pointer" : "default");
          if (!editable && !isCorner) onHover(space, e);
        }}
        onPointerOut={() => {
          hovered.current = false;
          setCursor("");
          if (!editable && !isCorner) onHoverEnd();
        }}
        onPointerDown={editable ? (e) => {
          e.stopPropagation();
          onSelect(space.id);
          if (!isCorner && onDragStart) {
            try { (e.target as any).setPointerCapture(e.pointerId); } catch {}
            setCursor("grabbing");
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
          setCursor("grab");
          onDragEnd?.(e);
        } : undefined}
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
