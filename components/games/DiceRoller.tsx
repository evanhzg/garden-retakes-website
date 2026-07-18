"use client";

import React, { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import * as CANNON from "cannon-es";

const DICE_SIZE = 0.08;

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

function createWalls(world: CANNON.World) {
  const wallMaterial = new CANNON.Material();
  const wallShape = new CANNON.Box(new CANNON.Vec3(10, 10, 0.5));
  
  // North
  const wallN = new CANNON.Body({ mass: 0, shape: wallShape, material: wallMaterial });
  wallN.position.set(0, 5, -2.5);
  world.addBody(wallN);
  // South
  const wallS = new CANNON.Body({ mass: 0, shape: wallShape, material: wallMaterial });
  wallS.position.set(0, 5, 2.5);
  world.addBody(wallS);
  // East
  const wallE = new CANNON.Body({ mass: 0, shape: wallShape, material: wallMaterial });
  wallE.position.set(2.5, 5, 0);
  wallE.quaternion.setFromEuler(0, Math.PI / 2, 0);
  world.addBody(wallE);
  // West
  const wallW = new CANNON.Body({ mass: 0, shape: wallShape, material: wallMaterial });
  wallW.position.set(-2.5, 5, 0);
  wallW.quaternion.setFromEuler(0, Math.PI / 2, 0);
  world.addBody(wallW);
}

function findTrajectoryForPair(target1: number, target2: number) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -60, 0) });
  world.defaultContactMaterial.restitution = 0.4;
  world.defaultContactMaterial.friction = 0.5;

  const floor = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(floor);

  createWalls(world);

  const dice1 = new CANNON.Body({ mass: 1, shape: new CANNON.Box(new CANNON.Vec3(DICE_SIZE, DICE_SIZE, DICE_SIZE)) });
  const dice2 = new CANNON.Body({ mass: 1, shape: new CANNON.Box(new CANNON.Vec3(DICE_SIZE, DICE_SIZE, DICE_SIZE)) });
  world.addBody(dice1);
  world.addBody(dice2);

  // Start closer to center to fit inside the new 2.5x2.5 boundary
  const startPos1 = new CANNON.Vec3(-1, 8, -1);
  const startPos2 = new CANNON.Vec3(1, 8, 1);

  let attempts = 0;
  while (attempts < 2000) {
    attempts++;

    dice1.position.copy(startPos1);
    dice1.velocity.setZero();
    dice1.angularVelocity.setZero();
    dice1.quaternion.setFromEuler(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
    const initialQuat1 = dice1.quaternion.clone();
    const force1 = new CANNON.Vec3(Math.random() * 4, Math.random() * 2 - 1, Math.random() * 4);
    const offset1 = new CANNON.Vec3((Math.random() - 0.5) * DICE_SIZE, (Math.random() - 0.5) * DICE_SIZE, (Math.random() - 0.5) * DICE_SIZE);
    dice1.applyImpulse(force1, offset1);

    dice2.position.copy(startPos2);
    dice2.velocity.setZero();
    dice2.angularVelocity.setZero();
    dice2.quaternion.setFromEuler(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
    const initialQuat2 = dice2.quaternion.clone();
    const force2 = new CANNON.Vec3(-(Math.random() * 4), Math.random() * 2 - 1, -(Math.random() * 4));
    const offset2 = new CANNON.Vec3((Math.random() - 0.5) * DICE_SIZE, (Math.random() - 0.5) * DICE_SIZE, (Math.random() - 0.5) * DICE_SIZE);
    dice2.applyImpulse(force2, offset2);

    let resting = false;
    for (let i = 0; i < 300; i++) {
      world.step(1 / 60);
      if (dice1.position.y < DICE_SIZE * 1.5 && dice2.position.y < DICE_SIZE * 1.5 && 
          dice1.velocity.lengthSquared() < 0.05 && dice2.velocity.lengthSquared() < 0.05 &&
          dice1.angularVelocity.lengthSquared() < 0.05 && dice2.angularVelocity.lengthSquared() < 0.05) {
        resting = true;
        break;
      }
    }

    if (resting) {
      const result1 = getTopFace(dice1.quaternion);
      const result2 = getTopFace(dice2.quaternion);
      
      if ((result1 === target1 && result2 === target2) || (result1 === target2 && result2 === target1)) {
        return {
          dice1: { startPos: startPos1, startQuat: initialQuat1, impulse: force1, offset: offset1, finalNum: result1 },
          dice2: { startPos: startPos2, startQuat: initialQuat2, impulse: force2, offset: offset2, finalNum: result2 }
        };
      }
    }
  }
  
  return null;
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

function DiceSimulation({ roll, onRest }: { roll: [number, number]; onRest: () => void }) {
  const { scene } = useThree();
  const worldRef = useRef<CANNON.World | null>(null);
  const diceBodies = useRef<CANNON.Body[]>([]);
  const diceMeshes = useRef<THREE.Mesh[]>([]);
  
  const hasSettled = useRef(false);

  useEffect(() => {
    // initialize physics
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -60, 0) });
    world.defaultContactMaterial.restitution = 0.4;
    world.defaultContactMaterial.friction = 0.5;
    worldRef.current = world;

    const floor = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
    floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(floor);

    createWalls(world);

    // run pre-simulation to find trajectory
    const trajectory = findTrajectoryForPair(roll[0], roll[1]);

    if (trajectory) {
      // Setup visible simulation bodies
      const body1 = new CANNON.Body({ mass: 1, shape: new CANNON.Box(new CANNON.Vec3(DICE_SIZE, DICE_SIZE, DICE_SIZE)) });
      body1.position.copy(trajectory.dice1.startPos);
      body1.quaternion.copy(trajectory.dice1.startQuat);
      body1.applyImpulse(trajectory.dice1.impulse, trajectory.dice1.offset);
      world.addBody(body1);

      const body2 = new CANNON.Body({ mass: 1, shape: new CANNON.Box(new CANNON.Vec3(DICE_SIZE, DICE_SIZE, DICE_SIZE)) });
      body2.position.copy(trajectory.dice2.startPos);
      body2.quaternion.copy(trajectory.dice2.startQuat);
      body2.applyImpulse(trajectory.dice2.impulse, trajectory.dice2.offset);
      world.addBody(body2);

      diceBodies.current = [body1, body2];
    }

    return () => {
      // cleanup meshes and bodies
      if (worldRef.current) {
        diceBodies.current.forEach(b => worldRef.current?.removeBody(b));
      }
    };
  }, [roll]);

  useFrame((state, delta) => {
    if (!worldRef.current || hasSettled.current) return;

    // limit delta to avoid exploding physics on tab lag
    worldRef.current.step(1/60, Math.min(delta, 0.1), 3);

    diceBodies.current.forEach((body, idx) => {
      const mesh = diceMeshes.current[idx];
      if (mesh) {
        mesh.position.copy(body.position as any);
        mesh.quaternion.copy(body.quaternion as any);
      }
    });

    if (diceBodies.current.length > 0) {
      const b1 = diceBodies.current[0];
      const b2 = diceBodies.current[1];
      if (b1.velocity.lengthSquared() < 0.05 && b2.velocity.lengthSquared() < 0.05 &&
          b1.angularVelocity.lengthSquared() < 0.05 && b2.angularVelocity.lengthSquared() < 0.05 &&
          b1.position.y < DICE_SIZE * 1.5 && b2.position.y < DICE_SIZE * 1.5) {
        hasSettled.current = true;
        setTimeout(() => onRest(), 1000); // Wait 1 sec before calling onRest (fadeout)
      }
    }
  });

  return (
    <>
      <mesh ref={(el) => { if(el) diceMeshes.current[0] = el; }} geometry={roundedBoxGeometry} material={materials} castShadow receiveShadow />
      <mesh ref={(el) => { if(el) diceMeshes.current[1] = el; }} geometry={roundedBoxGeometry} material={materials} castShadow receiveShadow />
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
      <Canvas shadows camera={{ position: [0, 6, 0], fov: 35 }}>
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
