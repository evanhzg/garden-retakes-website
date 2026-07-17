"use client";

import React, { useEffect, useRef } from "react";

export default function PhaserSpike() {
  const gameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Dynamically import phaser to avoid SSR issues
    let game: any;
    
    import("phaser").then((Phaser) => {
      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        parent: gameRef.current!,
        width: 800,
        height: 600,
        backgroundColor: '#2d2d2d',
        physics: {
          default: 'arcade',
          arcade: {
            debug: true,
          }
        },
        scene: {
          preload: preload,
          create: create,
          update: update
        }
      };

      game = new Phaser.Game(config);

      let player: Phaser.Types.Physics.Arcade.ImageWithDynamicBody;
      let cursors: Phaser.Types.Input.Keyboard.CursorKeys;

      function preload(this: Phaser.Scene) {
        // Draw a simple 32x32 rectangle to use as a sprite instead of loading an image
        const graphics = this.add.graphics();
        graphics.fillStyle(0xff0000, 1);
        graphics.fillRect(0, 0, 32, 32);
        graphics.generateTexture('playerSprite', 32, 32);
        graphics.destroy();
      }

      function create(this: Phaser.Scene) {
        player = this.physics.add.image(400, 300, 'playerSprite');
        player.setCollideWorldBounds(true);
        
        // Setup simple grid movement variables
        (player as any).isMoving = false;
        (player as any).targetPosition = { x: 400, y: 300 };

        if (this.input.keyboard) {
          cursors = this.input.keyboard.createCursorKeys();
        }
      }

      function update(this: Phaser.Scene) {
        if (!player || !cursors) return;

        const p = player as any;
        const speed = 150;
        const tileSize = 32;

        // If we reached the target, stop moving
        if (p.isMoving) {
          const dx = p.targetPosition.x - p.x;
          const dy = p.targetPosition.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < 2) { // Close enough to snap
            p.x = p.targetPosition.x;
            p.y = p.targetPosition.y;
            p.body.setVelocity(0, 0);
            p.isMoving = false;
          }
        }

        // If not moving, accept input for next tile
        if (!p.isMoving) {
          if (cursors.left.isDown) {
            p.targetPosition.x -= tileSize;
            p.body.setVelocityX(-speed);
            p.isMoving = true;
          } else if (cursors.right.isDown) {
            p.targetPosition.x += tileSize;
            p.body.setVelocityX(speed);
            p.isMoving = true;
          } else if (cursors.up.isDown) {
            p.targetPosition.y -= tileSize;
            p.body.setVelocityY(-speed);
            p.isMoving = true;
          } else if (cursors.down.isDown) {
            p.targetPosition.y += tileSize;
            p.body.setVelocityY(speed);
            p.isMoving = true;
          }
        }
      }
    });

    return () => {
      if (game) {
        game.destroy(true);
      }
    };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#1a1a1a', color: 'white' }}>
      <h1>Garden PKMN: Overworld Spike</h1>
      <p>Use Arrow Keys to move the red square (Grid-based 32px movement).</p>
      <div ref={gameRef} style={{ border: '4px solid #fff', borderRadius: '8px', overflow: 'hidden' }} />
    </div>
  );
}
