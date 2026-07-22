"use client";

import React, { useMemo, useRef, useState, useEffect } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { Lang } from "@/components/games/monopolyData";
import { DiceSimulation } from "@/components/games/DiceRoller";
import { Tile3D } from "./Tile3D";
import { Buildings3D } from "./Buildings3D";
import { Pawn3D } from "./Pawn3D";
import { TILE_H, resolveTheme } from "./theme";
import { boardGeometry } from "./layout";

const DICE_Y = 0.13;      // dice roll on the recessed centre field
const DICE_SCALE = 2.2;   // scale the small dice arena up onto the board

// Faint diagonal board-name watermark for the centre field.
function useCenterLogo(label: string): THREE.CanvasTexture | null {
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
    const size = label.length > 12 ? 60 : 84;
    ctx.font = `900 ${size}px 'Segoe UI', sans-serif`;
    ctx.fillText(label.toUpperCase(), 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }, [label]);
}

type SceneProps = {
  gameState: any;
  lang: Lang;
  boardMeta: any;
  onSelectSpace: (id: number) => void;
  onHoverSpace: (space: any, e: ThreeEvent<PointerEvent>) => void;
  onHoverEnd: () => void;
  rollKey: number;
  lastRoll: [number, number] | null;
  onDiceSettled: () => void;
};

function Scene(props: SceneProps) {
  const { gameState, lang, boardMeta, onSelectSpace, onHoverSpace, onHoverEnd, rollKey, lastRoll, onDiceSettled } = props;
  const perSide = boardMeta?.perSide ?? 9;
  const geo = useMemo(() => boardGeometry(perSide), [perSide]);
  const theme = useMemo(() => resolveTheme(boardMeta?.theme), [boardMeta?.theme]);
  const logo = useCenterLogo(boardMeta?.name || "MONOPOLY");
  const total = gameState.board.length;

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
        position={[geo.half * 1.5, geo.half * 3, geo.half * 1.9]}
        intensity={1.35}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-geo.half}
        shadow-camera-right={geo.half}
        shadow-camera-top={geo.half}
        shadow-camera-bottom={-geo.half}
        shadow-camera-near={1}
        shadow-camera-far={geo.half * 9}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-geo.half * 1.7, geo.half * 1.4, -geo.half]} intensity={0.35} color="#8ab4ff" />

      {/* plinth */}
      <mesh position={[0, -0.28, 0]} receiveShadow>
        <boxGeometry args={[geo.sideLen + 0.5, 0.56, geo.sideLen + 0.5]} />
        <meshStandardMaterial color={theme.plinth} roughness={0.55} metalness={0.25} />
      </mesh>

      {/* recessed centre field */}
      <mesh position={[0, 0.06, 0]} receiveShadow>
        <boxGeometry args={[geo.fieldHalf * 2, 0.12, geo.fieldHalf * 2]} />
        <meshStandardMaterial color={theme.field} roughness={0.5} metalness={0.2} />
      </mesh>
      {logo && (
        <mesh position={[0, 0.121, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[geo.fieldHalf * 1.7, geo.fieldHalf * 1.7]} />
          <meshBasicMaterial map={logo} transparent />
        </mesh>
      )}

      {/* tiles */}
      {gameState.board.map((space: any) => (
        <Tile3D
          key={space.id}
          space={space}
          lang={lang}
          boardMeta={boardMeta}
          ownerColor={space.owner ? gameState.playerStates[space.owner]?.color ?? null : null}
          onSelect={onSelectSpace}
          onHover={onHoverSpace}
          onHoverEnd={onHoverEnd}
        />
      ))}

      {/* houses / hotels */}
      {gameState.board.map((space: any) => (
        <Buildings3D key={`b${space.id}`} space={space} perSide={perSide} />
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
            perSide={perSide}
            total={total}
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
        minDistance={geo.half * 1.55}
        maxDistance={geo.half * 5.2}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2 - 0.06}
      />
    </>
  );
}

export default function Board3D(props: Omit<SceneProps, "boardMeta"> & { boardMeta?: any }) {
  const perSide = props.boardMeta?.perSide ?? 9;
  const half = boardGeometry(perSide).half;

  // Only mount the Canvas once the container has a real size. R3F measures its
  // parent once on mount; if the game view lays out a frame later, an initial
  // 0×0 measurement latches the canvas blank until a remount. Gating on a
  // ResizeObserver avoids that race.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const check = () => setReady(el.clientWidth > 0 && el.clientHeight > 0);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    check();
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapRef} style={{ position: "absolute", inset: 0 }}>
      {ready && (
        <Canvas
          shadows
          dpr={[1, 2]}
          gl={{ alpha: true, antialias: true }}
          camera={{ position: [0, half * 2.32, half * 2.5], fov: 42, near: 0.1, far: half * 20 }}
        >
          <Scene {...(props as SceneProps)} />
        </Canvas>
      )}
    </div>
  );
}
