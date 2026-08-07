"use client";

import React, { useState, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stage } from "@react-three/drei";
import { WeaponModel } from "./WeaponModel";
import styles from "./page.module.css";

interface Sticker {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
}

export default function CS2ViewerPage() {
  const [skinColor, setSkinColor] = useState("#4f4f4f");
  const [stickers, setStickers] = useState<Sticker[]>([]);

  const addSticker = () => {
    const x = (Math.random() - 0.5) * 2;
    const y = (Math.random() - 0.5) * 1;
    const z = 0.21; 
    
    setStickers([...stickers, {
      position: [x, y, z],
      rotation: [0, 0, Math.random() * Math.PI],
      scale: [0.5, 0.5, 0.5],
      color: `hsl(${Math.random() * 360}, 100%, 50%)`
    }]);
  };

  const clearStickers = () => {
    setStickers([]);
  };

  const skins = [
    { name: 'Default', color: '#4f4f4f' },
    { name: 'Asiimov', color: '#ff6600' },
    { name: 'Vulcan', color: '#0055ff' },
    { name: 'Redline', color: '#ff0000' },
    { name: 'Gold', color: '#ffd700' },
  ];

  return (
    <div className={styles.container}>
      {/* Sidebar for Controls */}
      <div className={styles.sidebar}>
        <div className={styles.header}>
          <h1 className={styles.title}>
            CS2 Skin Viewer <span className={styles.betaTag}>BETA</span>
          </h1>
          <p className={styles.subtitle}>Inspect weapons and place stickers in 3D.</p>
        </div>
        
        <div className={styles.content}>
          {/* Skin Selection */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Weapon Skin (Base Color)</h2>
            <div className={styles.skinGrid}>
              {skins.map(skin => (
                <button
                  key={skin.name}
                  onClick={() => setSkinColor(skin.color)}
                  className={`${styles.skinButton} ${skinColor === skin.color ? styles.skinButtonActive : ''}`}
                  style={{ backgroundColor: skin.color }}
                  title={skin.name}
                />
              ))}
            </div>
          </section>

          {/* Sticker Selection */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Stickers</h2>
            <p className={styles.helpText}>Place a random Holo sticker on the weapon body.</p>
            
            <div className={styles.buttonGroup}>
              <button onClick={addSticker} className={styles.actionButton}>
                + Apply Random Sticker
              </button>
              
              <button 
                onClick={clearStickers}
                disabled={stickers.length === 0}
                className={styles.dangerButton}
              >
                Clear All Stickers
              </button>
            </div>
            
            <div className={styles.statusBox}>
              <div className={styles.statusText}>Applied ({stickers.length})</div>
              <div className={styles.stickerList}>
                {stickers.map((s, i) => (
                  <div key={i} className={styles.stickerTag} style={{ backgroundColor: s.color + '40', color: s.color, borderColor: s.color }}>
                    S{i+1}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* 3D Canvas Area */}
      <div className={styles.canvasArea}>
        <Canvas camera={{ position: [0, 0, 8], fov: 45 }} shadows dpr={[1, 2]}>
          <Suspense fallback={null}>
            <Stage environment="city" intensity={0.5}>
              <WeaponModel skinColor={skinColor} stickers={stickers} />
            </Stage>
            <OrbitControls 
              autoRotate 
              autoRotateSpeed={0.5}
              enablePan={false}
              minDistance={3}
              maxDistance={15}
            />
          </Suspense>
        </Canvas>
        
        {/* Helper overlay */}
        <div className={styles.overlayText}>
          <p>Left Click + Drag to rotate</p>
          <p>Scroll to zoom</p>
        </div>
      </div>
    </div>
  );
}
