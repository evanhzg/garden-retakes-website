"use client";
import React, { useRef, useMemo } from "react";
import { Decal } from "@react-three/drei";
import * as THREE from "three";

interface Sticker {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
}

export function WeaponModel({ skinColor, stickers }: { skinColor: string, stickers: Sticker[] }) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Create a somewhat gun-like shape using ExtrudeGeometry for simplicity but decent look
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(4, 0); // barrel
    s.lineTo(4, 0.5);
    s.lineTo(1.5, 0.5); // body top
    s.lineTo(1.5, 1);
    s.lineTo(-2, 1); // stock top
    s.lineTo(-2, -0.5); // stock bottom
    s.lineTo(-0.5, -0.5);
    s.lineTo(-0.5, -1.5); // grip
    s.lineTo(0.5, -1.5);
    s.lineTo(0.5, 0);
    return s;
  }, []);

  const extrudeSettings = { depth: 0.4, bevelEnabled: true, bevelSegments: 2, steps: 2, bevelSize: 0.05, bevelThickness: 0.05 };
  
  const geometry = useMemo(() => {
    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.center();
    geo.computeVertexNormals();
    return geo;
  }, [shape]);

  return (
    <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial 
        color={skinColor} 
        roughness={0.4} 
        metalness={0.6}
      />
      
      {stickers.map((sticker, idx) => (
        <StickerDecal key={idx} {...sticker} />
      ))}
    </mesh>
  );
}

function StickerDecal({ position, rotation, scale, color }: Sticker) {
  // We simulate a sticker using a simple decal with a solid color/texture
  // Since we don't have external textures guaranteed, we use a basic material override for the decal or load a placeholder texture.
  // We'll create a simple canvas texture for the sticker.
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = color || '#ff00ff';
      ctx.beginPath();
      ctx.arc(128, 128, 120, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 80px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('CS', 128, 128);
    }
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }, [color]);

  return (
    <Decal position={position} rotation={rotation} scale={scale}>
      <meshStandardMaterial 
        map={texture} 
        polygonOffset 
        polygonOffsetFactor={-1} 
        transparent 
        depthTest={true} 
        depthWrite={false}
        roughness={0.2}
        metalness={0.8}
      />
    </Decal>
  );
}
