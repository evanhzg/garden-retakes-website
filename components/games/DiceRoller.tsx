"use client";

import React, { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import * as CANNON from "cannon-es";

const DICE_SIZE = 0.15;
// Interior half-width of the rolling arena. Kept small so both dice always
// come to rest near the centre of the board.
const ARENA_HALF = 1.0;
const GRAVITY = -30;

function getTopFace(quaternion: CANNON.Quaternion) {
  const up = new CANNON.Vec3(0, 1, 0);
  let maxDot = -Infinity;
  let topFace = 1;

  const axes = [
    { vec: new CANNON.Vec3(1, 0, 0), face: 2 },
    { vec: new CANNON.Vec3(-1, 0, 0), face: 5 },
    { vec: new CANNON.Vec3(0, 1, 0), face: 1 },
    { vec: new CANNON.Vec3(0, -1, 0), face: 6 },
    { vec: new CANNON.Vec3(0, 0, 1), face: 3 },
    { vec: new CANNON.Vec3(0, 0, -1), face: 4 },
  ];

  for (const axis of axes) {
    const worldAxis = quaternion.vmult(axis.vec);
    const dot = worldAxis.dot(up);
    if (dot > maxDot) {
      maxDot = dot;
      topFace = axis.face;
    }
  }
  return topFace;
}

// Box the dice into a tight arena of interior half-width `half` so they settle
// near the centre. Walls sit just outside the interior and are tall.
function createWalls(world: CANNON.World, half = ARENA_HALF) {
  const wallMaterial = new CANNON.Material();
  const t = 0.4; // wall thickness
  const h = 6;   // wall height
  const shapeNS = new CANNON.Box(new CANNON.Vec3(half + t, h, t));
  const shapeEW = new CANNON.Box(new CANNON.Vec3(t, h, half + t));
  const add = (shape: CANNON.Box, x: number, z: number) => {
    const b = new CANNON.Body({ mass: 0, shape, material: wallMaterial });
    b.position.set(x, h - 1, z);
    world.addBody(b);
  };
  add(shapeNS, 0, -(half + t)); // north
  add(shapeNS, 0, half + t);    // south
  add(shapeEW, half + t, 0);    // east
  add(shapeEW, -(half + t), 0); // west
}

// Orientation that rests the given face pointing straight up (static fallback).
function restingQuaternionForFace(face: number): CANNON.Quaternion {
  const axes: Record<number, [number, number, number]> = {
    1: [0, 1, 0], 6: [0, -1, 0], 2: [1, 0, 0], 5: [-1, 0, 0], 3: [0, 0, 1], 4: [0, 0, -1],
  };
  const a = new THREE.Vector3(...(axes[face] || [0, 1, 0]));
  const q = new THREE.Quaternion().setFromUnitVectors(a, new THREE.Vector3(0, 1, 0));
  return new CANNON.Quaternion(q.x, q.y, q.z, q.w);
}

// Pre-simulate throws until we find one that (a) lands showing the target pair
// and (b) rests near the centre without overlap. Deterministic single-step
// physics so the on-screen sim reproduces it exactly.
function findTrajectoryForPair(target1: number, target2: number) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY, 0) });
  world.defaultContactMaterial.restitution = 0.3;
  world.defaultContactMaterial.friction = 0.6;

  const floor = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(floor);

  createWalls(world, ARENA_HALF);

  const dice1 = new CANNON.Body({ mass: 1, shape: new CANNON.Box(new CANNON.Vec3(DICE_SIZE, DICE_SIZE, DICE_SIZE)) });
  const dice2 = new CANNON.Body({ mass: 1, shape: new CANNON.Box(new CANNON.Vec3(DICE_SIZE, DICE_SIZE, DICE_SIZE)) });
  world.addBody(dice1);
  world.addBody(dice2);

  const startPos1 = new CANNON.Vec3(-0.4, 2.2, 0.18);
  const startPos2 = new CANNON.Vec3(0.4, 2.2, -0.18);
  const minSep = DICE_SIZE * 2.4;

  let best: any = null;
  let bestScore = Infinity;

  // Bounded search — cheap enough to run synchronously (and twice under dev
  // StrictMode) without stalling the UI. `best` guarantees a usable result.
  for (let attempt = 0; attempt < 500; attempt++) {
    dice1.position.copy(startPos1);
    dice1.velocity.setZero();
    dice1.angularVelocity.setZero();
    dice1.quaternion.setFromEuler(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
    const q1 = dice1.quaternion.clone();
    const f1 = new CANNON.Vec3((Math.random() - 0.5) * 1.4, Math.random() * 0.6, (Math.random() - 0.5) * 1.4);
    const o1 = new CANNON.Vec3((Math.random() - 0.5) * DICE_SIZE, (Math.random() - 0.5) * DICE_SIZE, (Math.random() - 0.5) * DICE_SIZE);
    dice1.applyImpulse(f1, o1);

    dice2.position.copy(startPos2);
    dice2.velocity.setZero();
    dice2.angularVelocity.setZero();
    dice2.quaternion.setFromEuler(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
    const q2 = dice2.quaternion.clone();
    const f2 = new CANNON.Vec3((Math.random() - 0.5) * 1.4, Math.random() * 0.6, (Math.random() - 0.5) * 1.4);
    const o2 = new CANNON.Vec3((Math.random() - 0.5) * DICE_SIZE, (Math.random() - 0.5) * DICE_SIZE, (Math.random() - 0.5) * DICE_SIZE);
    dice2.applyImpulse(f2, o2);

    let resting = false;
    for (let i = 0; i < 190; i++) {
      world.step(1 / 60);
      if (dice1.position.y < DICE_SIZE * 1.6 && dice2.position.y < DICE_SIZE * 1.6 &&
          dice1.velocity.lengthSquared() < 0.03 && dice2.velocity.lengthSquared() < 0.03 &&
          dice1.angularVelocity.lengthSquared() < 0.03 && dice2.angularVelocity.lengthSquared() < 0.03) {
        resting = true;
        break;
      }
    }
    if (!resting) continue;

    const r1 = getTopFace(dice1.quaternion);
    const r2 = getTopFace(dice2.quaternion);
    const match = (r1 === target1 && r2 === target2) || (r1 === target2 && r2 === target1);
    if (!match) continue;

    const d1 = Math.hypot(dice1.position.x, dice1.position.z);
    const d2 = Math.hypot(dice2.position.x, dice2.position.z);
    const sep = Math.hypot(dice1.position.x - dice2.position.x, dice1.position.z - dice2.position.z);
    const cand = {
      dice1: { startPos: startPos1.clone(), startQuat: q1, impulse: f1, offset: o1, finalNum: r1 },
      dice2: { startPos: startPos2.clone(), startQuat: q2, impulse: f2, offset: o2, finalNum: r2 },
    };

    // Good enough — both reasonably centred and separated: stop searching early.
    if (d1 < 0.8 && d2 < 0.8 && sep > minSep) return cand;

    const score = d1 + d2 + (sep < minSep ? 4 : 0);
    if (score < bestScore) { bestScore = score; best = cand; }
  }

  return best;
}

function createDiceTexture(number: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Texture();
  
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#000000";

  const drawDot = (x: number, y: number) => {
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.fill();
  };

  const positions: Record<number, number[][]> = {
    1: [[128, 128]],
    2: [[64, 64], [192, 192]],
    3: [[64, 64], [128, 128], [192, 192]],
    4: [[64, 64], [192, 64], [64, 192], [192, 192]],
    5: [[64, 64], [192, 64], [128, 128], [64, 192], [192, 192]],
    6: [[64, 48], [192, 48], [64, 128], [192, 128], [64, 208], [192, 208]],
  };

  if (positions[number]) {
    positions[number].forEach((pos) => drawDot(pos[0], pos[1]));
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 16;
  return texture;
}

const textures = [
  createDiceTexture(2), // 0: X+ (Right)
  createDiceTexture(5), // 1: X- (Left)
  createDiceTexture(1), // 2: Y+ (Top)
  createDiceTexture(6), // 3: Y- (Bottom)
  createDiceTexture(3), // 4: Z+ (Front)
  createDiceTexture(4), // 5: Z- (Back)
];

const materials = textures.map(t => new THREE.MeshStandardMaterial({ map: t, roughness: 0.2, metalness: 0.1 }));

const roundedBoxGeometry = new THREE.BoxGeometry(1, 1, 1, 10, 10, 10);
const posAttr = roundedBoxGeometry.attributes.position;
const r = 0.1;
for (let i = 0; i < posAttr.count; i++) {
  const v = new THREE.Vector3().fromBufferAttribute(posAttr, i);
  const subCubeHalfSize = 0.5 - r;
  const subCube = new THREE.Vector3(Math.sign(v.x), Math.sign(v.y), Math.sign(v.z)).multiplyScalar(subCubeHalfSize);
  const addition = new THREE.Vector3().subVectors(v, subCube);
  
  if (Math.abs(v.x) > subCubeHalfSize && Math.abs(v.y) > subCubeHalfSize && Math.abs(v.z) > subCubeHalfSize) {
    addition.normalize().multiplyScalar(r);
    v.copy(subCube.add(addition));
  } else if (Math.abs(v.x) > subCubeHalfSize && Math.abs(v.y) > subCubeHalfSize) {
    addition.z = 0; addition.normalize().multiplyScalar(r);
    v.x = subCube.x + addition.x; v.y = subCube.y + addition.y;
  } else if (Math.abs(v.x) > subCubeHalfSize && Math.abs(v.z) > subCubeHalfSize) {
    addition.y = 0; addition.normalize().multiplyScalar(r);
    v.x = subCube.x + addition.x; v.z = subCube.z + addition.z;
  } else if (Math.abs(v.y) > subCubeHalfSize && Math.abs(v.z) > subCubeHalfSize) {
    addition.x = 0; addition.normalize().multiplyScalar(r);
    v.y = subCube.y + addition.y; v.z = subCube.z + addition.z;
  }
  posAttr.setXYZ(i, v.x, v.y, v.z);
}
roundedBoxGeometry.computeVertexNormals();

export function DiceSimulation({ roll, onRest }: { roll: [number, number]; onRest: () => void }) {
  const { scene } = useThree();
  const worldRef = useRef<CANNON.World | null>(null);
  const diceBodies = useRef<CANNON.Body[]>([]);
  const diceMeshes = useRef<THREE.Mesh[]>([]);
  
  const hasSettled = useRef(false);
  const settleFrames = useRef(0);

  // Fire onRest exactly once, then keep the settled dice on screen.
  const finish = () => {
    if (hasSettled.current) return;
    hasSettled.current = true;
    setTimeout(() => onRest(), 1200);
  };

  useEffect(() => {
    hasSettled.current = false;
    settleFrames.current = 0;
    // initialize physics — identical parameters to the pre-simulation so the
    // on-screen roll reproduces the pre-computed result exactly.
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY, 0) });
    world.defaultContactMaterial.restitution = 0.3;
    world.defaultContactMaterial.friction = 0.6;
    worldRef.current = world;

    const floor = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
    floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(floor);

    createWalls(world, ARENA_HALF);

    const trajectory = findTrajectoryForPair(roll[0], roll[1]);

    const body1 = new CANNON.Body({ mass: 1, shape: new CANNON.Box(new CANNON.Vec3(DICE_SIZE, DICE_SIZE, DICE_SIZE)) });
    const body2 = new CANNON.Body({ mass: 1, shape: new CANNON.Box(new CANNON.Vec3(DICE_SIZE, DICE_SIZE, DICE_SIZE)) });

    if (trajectory) {
      body1.position.copy(trajectory.dice1.startPos);
      body1.quaternion.copy(trajectory.dice1.startQuat);
      body1.applyImpulse(trajectory.dice1.impulse, trajectory.dice1.offset);
      body2.position.copy(trajectory.dice2.startPos);
      body2.quaternion.copy(trajectory.dice2.startQuat);
      body2.applyImpulse(trajectory.dice2.impulse, trajectory.dice2.offset);
    } else {
      // Fallback (should be rare): place the dice centred, already showing the
      // requested faces, so we never leave the roll unresolved.
      body1.position.set(-0.35, DICE_SIZE, 0.15);
      body1.quaternion.copy(restingQuaternionForFace(roll[0]));
      body2.position.set(0.35, DICE_SIZE, -0.15);
      body2.quaternion.copy(restingQuaternionForFace(roll[1]));
    }

    world.addBody(body1);
    world.addBody(body2);
    diceBodies.current = [body1, body2];

    // Hard failsafe: the dice can occasionally come to rest leaning together in a
    // pose the motion test doesn't catch. Never leave the roll unresolved —
    // guarantee onRest fires so play controls always re-enable.
    const failSafe = setTimeout(() => finish(), 4000);

    return () => {
      clearTimeout(failSafe);
      if (worldRef.current) {
        diceBodies.current.forEach(b => worldRef.current?.removeBody(b));
      }
    };
  }, [roll]);

  useFrame(() => {
    if (!worldRef.current || hasSettled.current) return;

    // Single fixed step per frame — matches the pre-sim's stepping, keeping the
    // visible faces identical to the target roll regardless of frame rate.
    worldRef.current.step(1 / 60);

    diceBodies.current.forEach((body, idx) => {
      const mesh = diceMeshes.current[idx];
      if (mesh) {
        mesh.position.copy(body.position as any);
        mesh.quaternion.copy(body.quaternion as any);
      }
    });

    const b1 = diceBodies.current[0];
    const b2 = diceBodies.current[1];
    if (!b1 || !b2) return;

    // Consider the roll settled once both dice have been nearly motionless for a
    // few consecutive frames (position-independent, so tilted rests still count).
    const still =
      b1.velocity.lengthSquared() < 0.02 && b2.velocity.lengthSquared() < 0.02 &&
      b1.angularVelocity.lengthSquared() < 0.02 && b2.angularVelocity.lengthSquared() < 0.02;

    if (still) {
      settleFrames.current++;
      if (settleFrames.current > 10) finish();
    } else {
      settleFrames.current = 0;
    }
  });

  return (
    <>
      <mesh ref={(el) => { if(el) diceMeshes.current[0] = el; }} geometry={roundedBoxGeometry} material={materials} castShadow receiveShadow scale={[DICE_SIZE*2, DICE_SIZE*2, DICE_SIZE*2]} />
      <mesh ref={(el) => { if(el) diceMeshes.current[1] = el; }} geometry={roundedBoxGeometry} material={materials} castShadow receiveShadow scale={[DICE_SIZE*2, DICE_SIZE*2, DICE_SIZE*2]} />
      <ambientLight intensity={1.5} />
      <directionalLight position={[5, 10, 5]} intensity={2} castShadow />
    </>
  );
}

export default function DiceRoller({ lastRoll, rollKey, onAnimationComplete }: { lastRoll: [number, number] | null; rollKey: number; onAnimationComplete: () => void }) {
  const [activeRoll, setActiveRoll] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (lastRoll && rollKey > 0) {
      setActiveRoll(lastRoll);
    }
  }, [rollKey, lastRoll]); 

  // Instead of unmounting when activeRoll is null, we just wait until the first roll
  if (!activeRoll) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 10 }}>
      {/* 
        OrthographicCamera or perspective from straight above prevents the board's CSS 
        transform from visually mismatching the Canvas perspective.
      */}
      <Canvas shadows camera={{ position: [0, 4.4, 0], fov: 30 }}>
        <DiceSimulation 
          key={rollKey} // Force remount on new roll
          roll={activeRoll} 
          onRest={() => {
            onAnimationComplete();
          }} 
        />
      </Canvas>
    </div>
  );
}
