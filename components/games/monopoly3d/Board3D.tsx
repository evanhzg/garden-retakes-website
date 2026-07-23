"use client";

import React, { useMemo, useRef, useState, useEffect } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera, PerspectiveCamera, Html } from "@react-three/drei";
import * as THREE from "three";
import { tileShortName, type Lang } from "@/components/games/monopolyData";
import { DiceSimulation } from "@/components/games/DiceRoller";
import { Tile3D } from "./Tile3D";
import { Buildings3D } from "./Buildings3D";
import { Pawn3D } from "./Pawn3D";
import { TILE_H, SURFACE_Y, resolveTheme } from "./theme";
import { buildLayout, type Layout } from "./layout";

const DICE_Y = 0.13;
const DICE_SCALE = 2.2;
const DEFAULT_ROLES = { go: 0, jail: 10, goToJail: 30, freeParking: 20 };

// ---------------------------------------------------------------------------
// Business-Tour style helpers (floating name tags + a championship trophy).
// ---------------------------------------------------------------------------
const labelCache = new Map<string, THREE.CanvasTexture>();
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function labelTexture(name: string): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const hit = labelCache.get(name);
  if (hit) return hit;
  const W = 256, H = 72;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  roundRectPath(ctx, 4, 14, W - 8, H - 28, 18);
  ctx.fillStyle = "rgba(8,14,26,0.82)"; ctx.fill();
  ctx.strokeStyle = "rgba(56,189,248,0.65)"; ctx.lineWidth = 3; ctx.stroke();
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  let fs = 30; ctx.font = `800 ${fs}px 'Segoe UI', sans-serif`;
  while (ctx.measureText(name).width > W - 30 && fs > 13) { fs -= 2; ctx.font = `800 ${fs}px 'Segoe UI', sans-serif`; }
  ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 4;
  ctx.strokeText(name, W / 2, H / 2);
  ctx.fillStyle = "#ffffff"; ctx.fillText(name, W / 2, H / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  labelCache.set(name, tex);
  return tex;
}
function TileNameLabel({ name, position }: { name: string; position: [number, number, number] }) {
  const tex = useMemo(() => labelTexture(name), [name]);
  if (!tex) return null;
  return (
    <sprite position={position} scale={[1.55, 0.44, 1]}>
      <spriteMaterial map={tex} transparent depthWrite={false} />
    </sprite>
  );
}
function ChampionshipTrophy({ position, accent }: { position: [number, number, number]; accent: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.04, 0]} castShadow>
        <cylinderGeometry args={[0.17, 0.21, 0.08, 20]} />
        <meshStandardMaterial color="#2a2416" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.022, 0.022, 0.07, 8]} />
        <meshStandardMaterial color="#f4d200" metalness={0.9} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.185, 0]} castShadow>
        <cylinderGeometry args={[0.085, 0.045, 0.12, 14]} />
        <meshStandardMaterial color="#f7d417" metalness={0.95} roughness={0.18} emissive="#a67c00" emissiveIntensity={0.35} />
      </mesh>
      {/* festival banner */}
      <mesh position={[0, 0.36, 0]}>
        <planeGeometry args={[0.52, 0.13]} />
        <meshStandardMaterial color={accent} side={THREE.DoubleSide} emissive={accent} emissiveIntensity={0.45} />
      </mesh>
    </group>
  );
}

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
  viewMode?: "3d" | "2d" | "bt";
  // editor mode
  editable?: boolean;
  selectedId?: number | null;
  onSelectTile?: (id: number) => void;
  onReorder?: (fromId: number, toId: number) => void;
  onDeleteTile?: (id: number) => void;
  renderTileMenu?: (id: number) => React.ReactNode;
};

function Scene(props: SceneProps) {
  const {
    gameState, lang, boardMeta, onSelectSpace, onHoverSpace, onHoverEnd, rollKey, lastRoll, onDiceSettled,
    viewMode = "3d",
    editable, selectedId, onSelectTile, onReorder, onDeleteTile, renderTileMenu,
  } = props;
  const is2D = viewMode === "2d";
  const isBT = viewMode === "bt";
  const total = gameState.board.length;
  const roles = boardMeta?.roles || DEFAULT_ROLES;
  const layout: Layout = useMemo(() => buildLayout(roles, total), [roles, total]);
  const theme = useMemo(() => resolveTheme(boardMeta?.theme), [boardMeta?.theme]);
  const logo = useCenterLogo(boardMeta?.name || "MONOPOLY");
  const half = layout.half;
  // Stable roll reference: only changes on a genuinely new roll (rollKey), so
  // the dice physics doesn't re-simulate on every unrelated state broadcast.
  const diceRoll = useMemo(() => lastRoll, [rollKey]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ---- editor drag (fly + live rearrange) ----
  const controlsRef = useRef<any>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropTargetId, setDropTargetId] = useState<number | null>(null);
  const [offBoard, setOffBoard] = useState(false);
  const [dragPoint, setDragPoint] = useState<[number, number] | null>(null);

  const groundPoint = (e: ThreeEvent<PointerEvent>): [number, number] | null => {
    const r: any = (e as any).ray;
    if (!r || Math.abs(r.direction.y) < 1e-6) return null;
    const t = (SURFACE_Y - r.origin.y) / r.direction.y;
    return [r.origin.x + t * r.direction.x, r.origin.z + t * r.direction.z];
  };
  const handleDragStart = (id: number) => {
    if (controlsRef.current) controlsRef.current.enabled = false; // imperative — beats render timing
    setDraggingId(id); setDropTargetId(id); setOffBoard(false); setDragPoint(layout.center(id));
  };
  const handleDragMove = (e: ThreeEvent<PointerEvent>) => {
    const gp = groundPoint(e);
    if (!gp) return;
    setDragPoint(gp);
    const [gx, gz] = gp;
    const out = Math.abs(gx) > layout.halfW + 0.6 || Math.abs(gz) > layout.halfH + 0.6;
    setOffBoard(out);
    if (!out) { const near = layout.nearestNonCorner(gx, gz); if (near >= 0) setDropTargetId(near); }
  };
  const handleDragEnd = () => {
    if (draggingId != null) {
      if (offBoard && onDeleteTile) onDeleteTile(draggingId);
      else if (dropTargetId != null && draggingId !== dropTargetId && onReorder) onReorder(draggingId, dropTargetId);
    }
    setDraggingId(null); setDropTargetId(null); setOffBoard(false); setDragPoint(null);
    if (controlsRef.current) controlsRef.current.enabled = true;
  };

  // Preview positions while dragging: other tiles slide to fill the gap and make
  // room at the drop slot; the dragged tile follows the pointer.
  const previewPos = useMemo(() => {
    if (draggingId == null || dropTargetId == null) return null;
    const corners = new Set(layout.cornerIds);
    const order = gameState.board.map((t: any) => t.id).filter((id: number) => !corners.has(id));
    const di = order.indexOf(draggingId);
    if (di >= 0) order.splice(di, 1);
    let ti = order.indexOf(dropTargetId);
    if (ti < 0) ti = order.length;
    order.splice(ti, 0, draggingId);
    const slots = layout.tiles.map((_, i) => i).filter((i) => !corners.has(i));
    const map: Record<number, [number, number, number]> = {};
    order.forEach((id: number, p: number) => { const slot = slots[p]; if (slot != null) map[id] = layout.tiles[slot].position; });
    return map;
  }, [draggingId, dropTargetId, layout, gameState.board]);

  const selectedCenter = selectedId != null && layout.tiles[selectedId] ? layout.center(selectedId) : null;

  return (
    <>
      <ambientLight intensity={isBT ? 0.72 : 0.62} />
      <hemisphereLight args={["#dbeafe", "#0a1a12", 0.5]} />
      {isBT && <directionalLight position={[-half * 1.6, half * 0.9, half * 1.3]} intensity={0.7} color={theme.accent} />}
      <directionalLight
        position={[half * 1.5, half * 3, half * 1.9]}
        intensity={isBT ? 1.7 : 1.35}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-half}
        shadow-camera-right={half}
        shadow-camera-top={half}
        shadow-camera-bottom={-half}
        shadow-camera-near={1}
        shadow-camera-far={half * 9}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-half * 1.7, half * 1.4, -half]} intensity={0.35} color="#8ab4ff" />

      {/* plinth */}
      <mesh position={[0, -0.28, 0]} receiveShadow>
        <boxGeometry args={[layout.halfW * 2 + 0.5, 0.56, layout.halfH * 2 + 0.5]} />
        <meshStandardMaterial color={theme.plinth} roughness={isBT ? 0.3 : 0.55} metalness={isBT ? 0.5 : 0.25} />
      </mesh>

      {/* recessed centre field (glossy neon in BT mode) */}
      <mesh position={[0, 0.06, 0]} receiveShadow>
        <boxGeometry args={[layout.fieldHalfW * 2, 0.12, layout.fieldHalfH * 2]} />
        <meshStandardMaterial
          color={theme.field}
          roughness={isBT ? 0.22 : 0.5}
          metalness={isBT ? 0.65 : 0.2}
          emissive={new THREE.Color(theme.field)}
          emissiveIntensity={isBT ? 0.18 : 0}
        />
      </mesh>
      {logo && (
        <mesh position={[0, 0.121, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[layout.fieldHalfW * 1.6, layout.fieldHalfH * 1.6]} />
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
          xform={layout.tiles[space.id]}
          targetPos={previewPos ? (previewPos[space.id] || layout.tiles[space.id]?.position) : layout.tiles[space.id]?.position}
          followPoint={editable && draggingId === space.id ? dragPoint : null}
          ownerColor={space.owner ? gameState.playerStates[space.owner]?.color ?? null : null}
          onSelect={editable ? (onSelectTile ?? (() => {})) : onSelectSpace}
          onHover={onHoverSpace}
          onHoverEnd={onHoverEnd}
          bt={isBT}
          editable={editable}
          selected={editable ? selectedId === space.id : false}
          dragging={editable ? draggingId === space.id : false}
          dropTarget={editable ? draggingId != null && dropTargetId === space.id && draggingId !== space.id : false}
          deleteMode={editable ? draggingId === space.id && offBoard : false}
          accent={theme.accent}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
        />
      ))}

      {/* houses / hotels + owned-tile decoration */}
      {gameState.board.map((space: any) => (
        <Buildings3D
          key={`b${space.id}`}
          space={space}
          layout={layout}
          boardMeta={boardMeta}
          bt={isBT}
          ownerColor={space.owner ? gameState.playerStates[space.owner]?.color ?? null : null}
        />
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
            layout={layout}
            total={total}
            bt={isBT}
          />
        );
      })}

      {/* BT mode: floating bold city-name tags above every tile. */}
      {isBT && gameState.board.map((space: any) => {
        if (space.type === "corner" || !layout.tiles[space.id]) return null;
        const [lx, lz] = layout.center(space.id);
        return <TileNameLabel key={`lbl${space.id}`} name={tileShortName(space, boardMeta?.boardId || "classic", lang)} position={[lx, TILE_H + 0.52, lz]} />;
      })}

      {/* BT mode: a trophy + festival banner on the championship city. */}
      {isBT && gameState.moduleState?.worldCup && layout.tiles[gameState.moduleState.worldCup.hostTileId] && (
        <ChampionshipTrophy
          accent={theme.accent}
          position={[
            layout.center(gameState.moduleState.worldCup.hostTileId)[0],
            SURFACE_Y,
            layout.center(gameState.moduleState.worldCup.hostTileId)[1],
          ]}
        />
      )}

      {/* World Cup marker: a floating trophy + multiplier over its host tile */}
      {gameState.moduleState?.worldCup && layout.tiles[gameState.moduleState.worldCup.hostTileId] && (
        <Html
          position={[
            layout.center(gameState.moduleState.worldCup.hostTileId)[0],
            TILE_H + 0.55,
            layout.center(gameState.moduleState.worldCup.hostTileId)[1],
          ]}
          center
          zIndexRange={[40, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div className="mono-wc-marker">🏆 ×{gameState.moduleState.worldCup.level}</div>
        </Html>
      )}

      {/* floating tile menu (editor) */}
      {editable && selectedCenter && renderTileMenu && draggingId == null && (
        <Html position={[selectedCenter[0], TILE_H + 0.5, selectedCenter[1]]} zIndexRange={[60, 0]} style={{ pointerEvents: "none" }}>
          {renderTileMenu(selectedId!)}
        </Html>
      )}

      {/* dice roll physically on the centre field */}
      {diceRoll && rollKey > 0 && (
        <group position={[0, DICE_Y, 0]} scale={DICE_SCALE}>
          <DiceSimulation key={rollKey} roll={diceRoll} onRest={onDiceSettled} />
        </group>
      )}

      {/* 2D view: a locked overhead orthographic camera (orbit disabled). up=−Z
          keeps GO at the bottom-right, matching the 3D default framing. */}
      {is2D && (
        <OrthographicCamera
          makeDefault
          position={[0, half * 8, 0]}
          up={[0, 0, -1]}
          zoom={Math.round(268 / half)}
          near={0.1}
          far={half * 40}
        />
      )}

      {/* BT view: a lower, more cinematic hero angle. */}
      {isBT && (
        <PerspectiveCamera makeDefault position={[half * 0.12, half * 1.5, half * 2.8]} fov={40} near={0.1} far={half * 24} />
      )}

      <OrbitControls
        ref={controlsRef}
        makeDefault
        target={[0, is2D ? 0 : 0.3, 0]}
        enablePan
        enableRotate={!is2D}
        enableDamping={!is2D}
        dampingFactor={0.08}
        minDistance={half * 1.55}
        maxDistance={half * 5.2}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2 - 0.06}
      />
    </>
  );
}

export default function Board3D(props: Omit<SceneProps, "boardMeta"> & { boardMeta?: any }) {
  const total = props.gameState?.board?.length ?? 40;
  const half = useMemo(() => buildLayout(props.boardMeta?.roles || DEFAULT_ROLES, total).half, [props.boardMeta?.roles, total]);

  // Only mount the Canvas once the container has a real size (avoids a 0×0
  // first-measure latching the board blank on game start).
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

  // Nudge R3F to composite its first frame: a conditionally-mounted Canvas can
  // measure once and not paint until an interaction. A couple of resize events
  // force react-three-fiber to re-measure and render.
  useEffect(() => {
    if (!ready) return;
    const fire = () => window.dispatchEvent(new Event("resize"));
    const raf = requestAnimationFrame(fire);
    const t1 = setTimeout(fire, 90);
    const t2 = setTimeout(fire, 300);
    return () => { cancelAnimationFrame(raf); clearTimeout(t1); clearTimeout(t2); };
  }, [ready]);

  return (
    <div ref={wrapRef} style={{ position: "absolute", inset: 0 }}>
      {ready && (
        <Canvas
          shadows
          dpr={[1, 1.5]}
          gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
          camera={{ position: [0, half * 2.32, half * 2.5], fov: 42, near: 0.1, far: half * 20 }}
        >
          <Scene {...(props as SceneProps)} />
        </Canvas>
      )}
    </div>
  );
}
