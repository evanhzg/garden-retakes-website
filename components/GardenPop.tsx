"use client";

import React, { Suspense, useMemo } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls, Stage } from "@react-three/drei";
import { STLLoader } from "three-stdlib";
import * as THREE from "three";

export type GardenPopConfig = {
  hair: string;
  stache: string;
  color: string;
  hairColor?: string;
};

export const defaultPopConfig: GardenPopConfig = {
  hair: "punk",
  stache: "none",
  color: "#fcdbb4",
  hairColor: "#2c3e50",
};

// Sub-component to conditionally load hair
function PopHair({ hair, hairColor }: { hair: string; hairColor: string }) {
  if (hair === "none") return null;
  const url = `/models/haircut_${hair}.stl`;
  return <PopHairMesh url={url} hairColor={hairColor} />;
}

function PopHairMesh({ url, hairColor }: { url: string; hairColor: string }) {
  const geometry = useLoader(STLLoader, url);
  const material = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: hairColor || "#2c3e50",
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
  }, [hairColor]);

  return (
    <mesh
      geometry={geometry}
      material={material}
      castShadow
      receiveShadow
      rotation={[-Math.PI / 2, 0, 0]}
    />
  );
}

function PopEyes() {
  const geometry = useLoader(STLLoader, "/models/pop_eyes.stl");
  const material = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: "#050505",
      roughness: 0.1,
      metalness: 0.8,
    });
  }, []);

  return (
    <mesh
      geometry={geometry}
      material={material}
      castShadow
      receiveShadow
      rotation={[-Math.PI / 2, 0, 0]}
    />
  );
}

function PopStache({ stache, hairColor }: { stache: string; hairColor: string }) {
  if (stache === "none" || !stache) return null;
  const url = `/models/pop_${stache}.stl`;
  return <PopStacheMesh url={url} hairColor={hairColor} />;
}

function PopStacheMesh({ url, hairColor }: { url: string; hairColor: string }) {
  const geometry = useLoader(STLLoader, url);
  const material = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: hairColor || "#2c3e50",
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
  }, [hairColor]);

  return (
    <mesh 
      geometry={geometry} 
      material={material} 
      castShadow 
      receiveShadow 
      rotation={[-Math.PI / 2, 0, 0]} 
    />
  );
}

function PopModel({ config }: { config: GardenPopConfig }) {
  const url = "/models/pop_template.stl";

  // STLLoader loads the geometry directly
  const geometry = useLoader(STLLoader, url);

  const material = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: config.color,
      roughness: 0.4,
      metalness: 0.1,
    });
  }, [config.color]);

  return (
    <mesh
      geometry={geometry}
      material={material}
      castShadow
      receiveShadow
      rotation={[-Math.PI / 2, 0, 0]}
    >
      {/* The base template */}
    </mesh>
  );
}

function PopScene({ config }: { config: GardenPopConfig }) {
  return (
    <group>
      <PopModel config={config} />
      <PopEyes />
      <PopHair hair={config.hair} hairColor={config.hairColor || "#2c3e50"} />
      <PopStache stache={config.stache} hairColor={config.hairColor || "#2c3e50"} />
    </group>
  );
}

export default function GardenPop({
  config,
  className,
  cameraDistance = 60,
  enableZoom = true,
}: {
  config: GardenPopConfig;
  className?: string;
  cameraDistance?: number;
  enableZoom?: boolean;
}) {
  return (
    <div className={`garden-pop-container ${className || ""}`} style={{ width: "100%", height: "100%", minHeight: "250px", cursor: "grab" }}>
      <Canvas shadows camera={{ position: [0, cameraDistance * 0.15, cameraDistance], fov: 40 }}>
        <Suspense fallback={null}>
          <Stage environment="city" intensity={0.6} adjustCamera={false}>
            <PopScene config={config} />
          </Stage>
          <OrbitControls
            autoRotate
            autoRotateSpeed={0.8}
            enableZoom={enableZoom}
            minDistance={cameraDistance * 0.7}
            maxDistance={cameraDistance * 1.5}
            enablePan={false}
            minPolarAngle={Math.PI / 3}
            maxPolarAngle={Math.PI / 1.8}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
