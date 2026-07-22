"use client";

import React, { useMemo } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { Lang } from "@/components/games/monopolyData";
import { DiceSimulation } from "@/components/games/DiceRoller";
import { Tile3D } from "./Tile3D";
import { Buildings3D } from "./Buildings3D";
import { Pawn3D } from "./Pawn3D";
import { SIDE_LEN, HALF, FIELD_HALF, TILE_H, PALETTE } from "./theme";

const DICE_Y = 0.13;      // dice roll on the recessed centre field
const DICE_SCALE = 2.2;   // scale the small dice arena up onto the board

// Faint diagonal "MONOPOLY" watermark for the centre field.
function useCenterLogo(): THREE.CanvasTexture | null {
  return useMemo(() => {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = 512; c.height = 512;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, 512, 512);
    ctx.translate(256, 256);
    ctx.rotate(-Math.PI / 4);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.font = "900 84px 'Segoe UI', sans-serif";
    ctx.fillText("MONOPOLY", 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }, []);
}

function Scene({
  gameState, lang, onSelectSpace, onHoverSpace, onHoverEnd, rollKey, lastRoll, onDiceSettled,
}: {
  gameState: any;
  lang: Lang;
  onSelectSpace: (id: number) => void;
  onHoverSpace: (space: any, e: ThreeEvent<PointerEvent>) => void;
  onHoverEnd: () => void;
  rollKey: number;
  lastRoll: [number, number] | null;
  onDiceSettled: () => void;
}) {
  const logo = useCenterLogo();

  // slot index per player so co-located pawns don't overlap
  const slotOf = useMemo(() => {
    const counts: Record<number, number> = {};
    const out: Record<string, number> = {};
    for (const pid of gameState.players) {
      const pos = gameState.playerStates[pid]?.position ?? 0;
      out[pid] = counts[pos] || 0;
      counts[pos] = (counts[pos] || 0) + 1;
    }
    return out;
  }, [gameState.players, gameState.playerStates]);

  return (
    <>
      <ambientLight intensity={0.62} />
      <hemisphereLight args={["#dbeafe", "#0a1a12", 0.5]} />
      <directionalLight
        position={[9, 17, 11]}
        intensity={1.35}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-HALF}
        shadow-camera-right={HALF}
        shadow-camera-top={HALF}
        shadow-camera-bottom={-HALF}
        shadow-camera-near={1}
        shadow-camera-far={48}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-10, 8, -6]} intensity={0.35} color="#8ab4ff" />

      {/* plinth */}
      <mesh position={[0, -0.28, 0]} receiveShadow>
        <boxGeometry args={[SIDE_LEN + 0.5, 0.56, SIDE_LEN + 0.5]} />
        <meshStandardMaterial color={PALETTE.plinth} roughness={0.55} metalness={0.25} />
      </mesh>

      {/* recessed centre field */}
      <mesh position={[0, 0.06, 0]} receiveShadow>
        <boxGeometry args={[FIELD_HALF * 2, 0.12, FIELD_HALF * 2]} />
        <meshStandardMaterial color={PALETTE.field} roughness={0.5} metalness={0.2} />
      </mesh>
      {logo && (
        <mesh position={[0, 0.121, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[FIELD_HALF * 1.7, FIELD_HALF * 1.7]} />
          <meshBasicMaterial map={logo} transparent />
        </mesh>
      )}

      {/* tiles */}
      {gameState.board.map((space: any) => (
        <Tile3D
          key={space.id}
          space={space}
          lang={lang}
          ownerColor={space.owner ? gameState.playerStates[space.owner]?.color ?? null : null}
          onSelect={onSelectSpace}
          onHover={onHoverSpace}
          onHoverEnd={onHoverEnd}
        />
      ))}

      {/* houses / hotels */}
      {gameState.board.map((space: any) => (
        <Buildings3D key={`b${space.id}`} space={space} />
      ))}

      {/* pawns */}
      {gameState.players.map((pid: string) => {
        const s = gameState.playerStates[pid];
        if (!s || s.bankrupt) return null;
        return (
          <Pawn3D
            key={pid}
            position={s.position}
            color={s.color}
            active={gameState.currentTurn === pid}
            slotIndex={slotOf[pid] ?? 0}
          />
        );
      })}

      {/* dice roll physically on the centre field */}
      {lastRoll && rollKey > 0 && (
        <group position={[0, DICE_Y, 0]} scale={DICE_SCALE}>
          <DiceSimulation key={rollKey} roll={lastRoll} onRest={onDiceSettled} />
        </group>
      )}

      <OrbitControls
        makeDefault
        target={[0, 0.3, 0]}
        enablePan
        enableDamping
        dampingFactor={0.08}
        minDistance={9}
        maxDistance={30}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2 - 0.06}
      />
    </>
  );
}

export default function Board3D(props: {
  gameState: any;
  lang: Lang;
  onSelectSpace: (id: number) => void;
  onHoverSpace: (space: any, e: ThreeEvent<PointerEvent>) => void;
  onHoverEnd: () => void;
  rollKey: number;
  lastRoll: [number, number] | null;
  onDiceSettled: () => void;
}) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true }}
      camera={{ position: [0, 13.5, 14.5], fov: 42, near: 0.1, far: 100 }}
    >
      <Scene {...props} />
    </Canvas>
  );
}
