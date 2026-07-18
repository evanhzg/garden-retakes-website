"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSocket } from "@/components/games/SocketProvider";
import { usePlayerNames, displayNameFor } from "@/components/games/hooks";
import BattleOverlay from "@/components/games/pkmn/BattleOverlay";
import PartyMenu from "@/components/games/pkmn/PartyMenu";
import StarterPick from "@/components/games/pkmn/StarterPick";
import BagMenu, { BagItem } from "@/components/games/pkmn/BagMenu";

export default function PhaserGame() {
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const { socket, isAuthed, steamId } = useSocket();
  const [mapState, setMapState] = useState<any>(null);
  const [isBattling, setIsBattling] = useState(false);
  const [showParty, setShowParty] = useState(false);
  const [showBag, setShowBag] = useState(false);
  const [bag, setBag] = useState<BagItem[]>([]);
  const [showStarter, setShowStarter] = useState(false);
  const [party, setParty] = useState<any[]>([]);
  
  // React state for chat
  const [chatMessage, setChatMessage] = useState("");
  
  // Expose Phaser game instance methods to React
  const gameInterface = useRef<any>(null);

  // Name resolution
  const playerIds = mapState ? Object.keys(mapState.players) : [];
  const names = usePlayerNames(playerIds);

  useEffect(() => {
    if (!socket || !isAuthed) return;
    socket.emit("pkmn_join", { mapId: "pallet_town" });

    socket.on("pkmn_map_state", (state) => {
      setMapState(state);
    });

    socket.on("pkmn_chat_message", (data) => {
      if (gameInterface.current) {
        gameInterface.current.showChatBubble(data.steamId, data.message);
      }
    });

    socket.on("pkmn_battle_start", () => {
      setIsBattling(true);
      setShowParty(false); // Close party if battle starts
    });

    socket.on("pkmn_choose_starter", () => setShowStarter(true));
    socket.on("pkmn_starter_confirmed", () => {
      setShowStarter(false);
      socket.emit("pkmn_get_party");
    });

    const handleParty = (data: any) => {
      setParty(data);
    };
    socket.on("pkmn_party_data", handleParty);
    const handleBag = (data: BagItem[]) => setBag(data);
    socket.on("pkmn_bag_data", handleBag);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameInterface.current?.isBattling) return;
      // Don't steal keys while typing in the chat box
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'Enter') {
        setShowParty(prev => !prev);
        socket.emit("pkmn_get_party");
      } else if (e.key === 'b' || e.key === 'B') {
        setShowBag(prev => !prev);
        socket.emit("pkmn_get_bag");
        socket.emit("pkmn_get_party");
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      socket.off("pkmn_map_state");
      socket.off("pkmn_chat_message");
      socket.off("pkmn_battle_start");
      socket.off("pkmn_choose_starter");
      socket.off("pkmn_starter_confirmed");
      socket.off("pkmn_party_data", handleParty);
      socket.off("pkmn_bag_data", handleBag);
      window.removeEventListener('keydown', handleKeyDown);
      socket.emit("pkmn_leave");
    };
  }, [socket, isAuthed]);

  // Sync resolved names into Phaser
  useEffect(() => {
    if (gameInterface.current) {
      gameInterface.current.updateNames(names);
    }
  }, [names]);

  useEffect(() => {
    if (!mapState || !socket || gameInterface.current) return; // Only start once

    // Non-null alias for use inside the Phaser closures (TS can't carry the
    // guard's narrowing into nested functions)
    const sock = socket;
    let game: any;

    import("phaser").then((Phaser) => {
      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.CANVAS,
        parent: gameContainerRef.current!,
        width: 800,
        height: 600,
        backgroundColor: '#4ade80', // Light green grass color
        physics: {
          default: 'arcade',
          arcade: { debug: false }
        },
        scene: {
          preload: preload,
          create: create,
          update: update
        }
      };

      game = new Phaser.Game(config);

      let localPlayer: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
      let cursors: Phaser.Types.Input.Keyboard.CursorKeys;

      // Store external references for React
      const sceneRefs: {
        otherPlayers: Record<string, Phaser.Types.Physics.Arcade.SpriteWithDynamicBody>;
        npcs: Record<string, Phaser.Types.Physics.Arcade.SpriteWithDynamicBody>;
        names: any;
        dpad: string | null;
        collisionsLayer: Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer | null;
        battlesLayer: Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer | null;
        map: Phaser.Tilemaps.Tilemap | null;
      } = { otherPlayers: {}, npcs: {}, names: {}, dpad: null, collisionsLayer: null, battlesLayer: null, map: null };

      gameInterface.current = {
        isBattling: false,
        updateNames: (newNames: any) => {
          sceneRefs.names = newNames;
          // Trigger name tag updates
          for (const steamId of Object.keys(sceneRefs.otherPlayers)) {
            const op = sceneRefs.otherPlayers[steamId];
            if ((op as any).nameText) {
              (op as any).nameText.setText(displayNameFor(steamId, newNames));
            }
          }
          if (localPlayer && (localPlayer as any).nameText) {
             (localPlayer as any).nameText.setText(displayNameFor(steamId as string, newNames));
          }
        },
        showChatBubble: (senderId: string, message: string) => {
          let target = senderId === steamId ? localPlayer : sceneRefs.otherPlayers[senderId];
          if (target && target.scene) {
            showBubble(target.scene, target, message);
          }
        },
        moveUp: () => { sceneRefs.dpad = 'up'; },
        moveDown: () => { sceneRefs.dpad = 'down'; },
        moveLeft: () => { sceneRefs.dpad = 'left'; },
        moveRight: () => { sceneRefs.dpad = 'right'; },
        stopMove: () => { sceneRefs.dpad = null; }
      };

      function preload(this: Phaser.Scene) {
        // Load the tilemap JSON and Tileset
        this.load.tilemapTiledJSON('map1', '/pkmn/maps/map1.json');
        this.load.image('tileset2.16', '/pkmn/tileset2.png'); // name from map1.json tilesets

        // Load sprites (64x64 frame size assumed for RPG Maker style 4x4 grid)
        this.load.spritesheet('mySprite', '/pkmn/sprites/NPC 01.png', { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('otherSprite', '/pkmn/sprites/NPC 02.png', { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('npcSprite', '/pkmn/sprites/NPC 03.png', { frameWidth: 64, frameHeight: 64 });
      }

      // Helper to add player sprite with name tag
      function createPlayer(scene: Phaser.Scene, x: number, y: number, key: string, steamId: string) {
        const sprite = scene.physics.add.sprite(x, y, key);
        sprite.setCollideWorldBounds(true);
        // Smaller bounding box for better collisions
        sprite.body?.setSize(32, 32);
        sprite.body?.setOffset(16, 32);

        (sprite as any).isMoving = false;
        (sprite as any).targetPosition = { x, y };
        
        const nameStr = displayNameFor(steamId, sceneRefs.names);
        const nameText = scene.add.text(x, y - 24, nameStr, {
          fontSize: '12px',
          color: '#ffffff',
          backgroundColor: '#000000aa',
          padding: { x: 2, y: 2 }
        }).setOrigin(0.5);
        
        (sprite as any).nameText = nameText;
        return sprite;
      }

      function showBubble(scene: Phaser.Scene, target: any, message: string) {
        if (target.bubble) {
          target.bubble.destroy();
        }
        
        const bubbleText = scene.add.text(target.x, target.y - 40, message, {
          fontSize: '14px',
          color: '#000000',
          backgroundColor: '#ffffff',
          padding: { x: 4, y: 4 },
          wordWrap: { width: 150 }
        }).setOrigin(0.5, 1);
        
        target.bubble = bubbleText;
        
        // Auto fade out
        scene.time.delayedCall(5000, () => {
          if (target.bubble === bubbleText) {
            bubbleText.destroy();
            target.bubble = null;
          }
        });
      }

      function create(this: Phaser.Scene) {
        // Create the tilemap
        const map = this.make.tilemap({ key: 'map1' });
        const tileset = map.addTilesetImage('tileset2.16', 'tileset2.16');
        
        if (tileset) {
          // Openmon map might have multiple layers. Let's try to create them all.
          // Typical Tiled maps have layer data we can iterate over.
          map.layers.forEach((layerData) => {
            const layer = map.createLayer(layerData.name, tileset, 0, 0);
            if (layer) {
              layer.setScale(2);
              
              // Check for collision layer (the user spells it 'colisions' or 'collisions')
              if (layerData.name.toLowerCase().includes('collision') || layerData.name.toLowerCase().includes('colision')) {
                layer.setCollisionByProperty({ collides: true });
                // Also try setting collision for any non-zero tile on the collision layer just in case
                layer.setCollisionByExclusion([-1, 0]);
                sceneRefs.collisionsLayer = layer;
              }

              // The "battles" layer marks tall grass — wild encounters only fire on it.
              if (layerData.name.toLowerCase().includes('battle')) {
                sceneRefs.battlesLayer = layer;
              }
            }
          });
          sceneRefs.map = map;
        }

        const mapWidth = (map.widthInPixels || 2000) * 2;
        const mapHeight = (map.heightInPixels || 2000) * 2;

        this.physics.world.setBounds(0, 0, mapWidth, mapHeight);

        const myData = mapState.players[steamId as string] || { x: 400, y: 300, facing: 'down' };
        localPlayer = createPlayer(this, myData.x, myData.y, 'mySprite', steamId as string);
        (localPlayer as any).facing = myData.facing;

        // Create player animations if not already created
        if (!this.anims.exists('down-walk')) {
          const animConfigs = [
            { key: 'down-walk', frames: [0, 1, 2, 3] },
            { key: 'left-walk', frames: [4, 5, 6, 7] },
            { key: 'right-walk', frames: [8, 9, 10, 11] },
            { key: 'up-walk', frames: [12, 13, 14, 15] }
          ];
          
          animConfigs.forEach(anim => {
            ['mySprite', 'otherSprite', 'npcSprite'].forEach(spriteKey => {
              this.anims.create({
                key: `${spriteKey}-${anim.key}`,
                frames: this.anims.generateFrameNumbers(spriteKey, { frames: anim.frames }),
                frameRate: 8,
                repeat: -1
              });
            });
          });
        }

        // Camera follow
        this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);
        this.cameras.main.startFollow(localPlayer, true, 0.1, 0.1);

        for (const [sId, pData] of Object.entries(mapState.players)) {
          if (sId !== steamId) {
            const op = createPlayer(this, (pData as any).x, (pData as any).y, 'otherSprite', sId);
            sceneRefs.otherPlayers[sId] = op;
          }
        }

        if (mapState.npcs) {
          for (const [npcId, npcData] of Object.entries(mapState.npcs)) {
            const op = createPlayer(this, (npcData as any).x, (npcData as any).y, 'npcSprite', npcId);
            if ((op as any).nameText) {
              (op as any).nameText.setText((npcData as any).name);
            }
            sceneRefs.npcs[npcId] = op;
          }
        }

        if (this.input.keyboard) {
          cursors = this.input.keyboard.createCursorKeys();
        }

        sock.on("pkmn_player_joined", (pData: any) => {
          if (pData.steamId !== steamId) {
            const op = createPlayer(this, pData.x, pData.y, 'otherSprite', pData.steamId);
            sceneRefs.otherPlayers[pData.steamId] = op;
          }
        });

        sock.on("pkmn_player_moved", (pData: any) => {
          if (pData.steamId !== steamId) {
            const op = sceneRefs.otherPlayers[pData.steamId];
            if (op) {
              (op as any).targetPosition = { x: pData.x, y: pData.y };
              (op as any).facing = pData.facing;
            }
          }
        });

        sock.on("pkmn_player_left", (data: any) => {
          if (sceneRefs.otherPlayers[data.steamId]) {
            const op = sceneRefs.otherPlayers[data.steamId] as any;
            if (op.nameText) op.nameText.destroy();
            if (op.bubble) op.bubble.destroy();
            op.destroy();
            delete sceneRefs.otherPlayers[data.steamId];
          }
        });
      }

      function update(this: Phaser.Scene) {
        if (!localPlayer || !cursors) return;

        // Sync name tags and bubbles position
        const syncOverlays = (p: any) => {
          if (p.nameText) {
            p.nameText.x = p.x;
            p.nameText.y = p.y - 24;
          }
          if (p.bubble) {
            p.bubble.x = p.x;
            p.bubble.y = p.y - 40;
          }
        };

        syncOverlays(localPlayer);

        for (const op of Object.values(sceneRefs.otherPlayers)) {
          const target = (op as any).targetPosition;
          let isMoving = false;
          if (target) {
            const dx = target.x - (op as any).x;
            const dy = target.y - (op as any).y;
            if (Math.abs(dx) > 1) {
               (op as any).x += dx * 0.1;
               isMoving = true;
            } else (op as any).x = target.x;
            
            if (Math.abs(dy) > 1) {
               (op as any).y += dy * 0.1;
               isMoving = true;
            } else (op as any).y = target.y;
          }
          syncOverlays(op);
          
          if (isMoving && (op as any).facing) {
            (op as Phaser.GameObjects.Sprite).play(`otherSprite-${(op as any).facing}-walk`, true);
          } else {
            (op as Phaser.GameObjects.Sprite).stop();
            // Set to first frame of current facing direction when idle
            if ((op as any).facing === 'down') (op as Phaser.GameObjects.Sprite).setFrame(0);
            if ((op as any).facing === 'left') (op as Phaser.GameObjects.Sprite).setFrame(4);
            if ((op as any).facing === 'right') (op as Phaser.GameObjects.Sprite).setFrame(8);
            if ((op as any).facing === 'up') (op as Phaser.GameObjects.Sprite).setFrame(12);
          }
        }

        // Sync NPC overlays
        for (const op of Object.values(sceneRefs.npcs)) {
          syncOverlays(op);
        }

        if (Phaser.Input.Keyboard.JustDown(cursors.space)) {
          const facing = (localPlayer as any).facing;
          let tx = localPlayer.x;
          let ty = localPlayer.y;
          if (facing === 'up') ty -= 32;
          if (facing === 'down') ty += 32;
          if (facing === 'left') tx -= 32;
          if (facing === 'right') tx += 32;

          if (mapState.npcs) {
            for (const [npcId, npcData] of Object.entries(mapState.npcs)) {
              const nx = (npcData as any).x;
              const ny = (npcData as any).y;
              if (Math.abs(nx - tx) < 32 && Math.abs(ny - ty) < 32) {
                sock.emit("pkmn_interact", { npcId });
                break;
              }
            }
          }
        }

        const p = localPlayer as any;
        const speed = 150;
        const tileSize = 32;

        if (p.isMoving) {
          const dx = p.targetPosition.x - p.x;
          const dy = p.targetPosition.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          (localPlayer as Phaser.GameObjects.Sprite).play(`mySprite-${p.facing}-walk`, true);
          
          if (dist < 10) {
            p.x = p.targetPosition.x;
            p.y = p.targetPosition.y;
            p.body.setVelocity(0, 0);
            p.isMoving = false;
            sock.emit("pkmn_move", { x: p.x, y: p.y, facing: p.facing });

            // Wild encounters fire only on tall grass (the "battles" layer). If the
            // map has no such layer, fall back to a low any-step chance so it still works.
            const bl = sceneRefs.battlesLayer as Phaser.Tilemaps.TilemapLayer | null;
            const onGrass = bl ? !!bl.getTileAtWorldXY(p.x / 2, p.y / 2) : false;
            const rate = onGrass ? 0.18 : (bl ? 0 : 0.08);
            if (!gameInterface.current?.isBattling && rate > 0 && Math.random() < rate) {
              gameInterface.current.isBattling = true; // Block further moves
              sock.emit("pkmn_encounter");
            }
          }
        } else {
            (localPlayer as Phaser.GameObjects.Sprite).stop();
            if (p.facing === 'down') (localPlayer as Phaser.GameObjects.Sprite).setFrame(0);
            if (p.facing === 'left') (localPlayer as Phaser.GameObjects.Sprite).setFrame(4);
            if (p.facing === 'right') (localPlayer as Phaser.GameObjects.Sprite).setFrame(8);
            if (p.facing === 'up') (localPlayer as Phaser.GameObjects.Sprite).setFrame(12);
        }

        if (!p.isMoving && !gameInterface.current?.isBattling) {
          let moved = false;
          if (cursors.left.isDown || sceneRefs.dpad === 'left') {
            p.targetPosition.x -= tileSize;
            p.body.setVelocityX(-speed);
            p.facing = 'left';
            moved = true;
          } else if (cursors.right.isDown || sceneRefs.dpad === 'right') {
            p.targetPosition.x += tileSize;
            p.body.setVelocityX(speed);
            p.facing = 'right';
            moved = true;
          } else if (cursors.up.isDown || sceneRefs.dpad === 'up') {
            p.targetPosition.y -= tileSize;
            p.body.setVelocityY(-speed);
            p.facing = 'up';
            moved = true;
          } else if (cursors.down.isDown || sceneRefs.dpad === 'down') {
            p.targetPosition.y += tileSize;
            p.body.setVelocityY(speed);
            p.facing = 'down';
            moved = true;
          }

          if (moved) {
            // Predict collisions
            let canMove = true;
            if (sceneRefs.collisionsLayer) {
              // Get the tile at the center of the target position. Since layer is scaled by 2,
              // world coords need to be halved, or we can use the camera. Phaser getTileAtWorldXY handles scale automatically if given camera,
              // but for safety we use the unscaled tile coords by dividing by the scale factor (2).
              const tile = sceneRefs.collisionsLayer.getTileAtWorldXY(
                p.targetPosition.x / 2, 
                p.targetPosition.y / 2, 
                true
              );
              
              if (tile && tile.properties.collides) {
                canMove = false;
              }
            }

            // Keep inside bounds
            const mapWidth = (sceneRefs.map?.widthInPixels || 2000) * 2;
            const mapHeight = (sceneRefs.map?.heightInPixels || 2000) * 2;
            p.targetPosition.x = Phaser.Math.Clamp(p.targetPosition.x, 16, mapWidth - 16);
            p.targetPosition.y = Phaser.Math.Clamp(p.targetPosition.y, 16, mapHeight - 16);
            
            if (canMove && (p.targetPosition.x !== p.x || p.targetPosition.y !== p.y)) {
              p.isMoving = true;
              sock.emit("pkmn_move", { x: p.targetPosition.x, y: p.targetPosition.y, facing: p.facing });
            } else {
              // Revert target position if blocked
              p.targetPosition.x = p.x;
              p.targetPosition.y = p.y;
              p.body.setVelocity(0, 0); // Wall collision
            }
          }
        }
      }
    });

    return () => {
      socket.off("pkmn_player_joined");
      socket.off("pkmn_player_moved");
      socket.off("pkmn_player_left");
      if (game) game.destroy(true);
      gameInterface.current = null;
    };
  }, [mapState, socket]);

  const handleChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;
    
    socket?.emit("pkmn_chat", { message: chatMessage });
    if (gameInterface.current && steamId) {
      gameInterface.current.showChatBubble(steamId, chatMessage);
    }
    setChatMessage("");
  };

  const handleDpadDown = (dir: string) => {
    if (gameInterface.current) {
      if (dir === 'up') gameInterface.current.moveUp();
      if (dir === 'down') gameInterface.current.moveDown();
      if (dir === 'left') gameInterface.current.moveLeft();
      if (dir === 'right') gameInterface.current.moveRight();
    }
  };

  const handleDpadUp = () => {
    if (gameInterface.current) gameInterface.current.stopMove();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100vh', background: '#1a1a1a', color: 'white' }}>
      <h1 style={{ margin: '16px 0 8px' }}>Garden PKMN: MMO Overworld</h1>
      
      {isAuthed ? (
        mapState ? (
          <div style={{ position: 'relative', width: 800, maxWidth: '100%' }}>
            {/* Phaser Game Canvas */}
            <div ref={gameContainerRef} style={{ border: '4px solid #fff', borderRadius: '8px', overflow: 'hidden', width: '100%', height: 600 }} />
            
            {/* Starter choice for brand-new trainers */}
            {showStarter && !isBattling && (
              <StarterPick onPick={(species) => socket?.emit("pkmn_pick_starter", { species })} />
            )}

            {/* Battle Overlay */}
            {isBattling && (
              <BattleOverlay onBattleEnd={() => {
                setIsBattling(false);
                if (gameInterface.current) gameInterface.current.isBattling = false;
              }} />
            )}

            {/* Chat Input Overlay */}
            <div style={{ position: 'absolute', bottom: 16, left: 16, display: 'flex', gap: 8, background: 'rgba(0,0,0,0.5)', padding: 8, borderRadius: 8 }}>
              <form onSubmit={handleChat} style={{ display: 'flex', gap: 8 }}>
                <input 
                  type="text" 
                  value={chatMessage} 
                  onChange={e => setChatMessage(e.target.value)}
                  placeholder="Say something or /heal..."
                  style={{ padding: '8px 12px', borderRadius: 4, border: 'none', outline: 'none', color: '#000' }}
                />
                <button type="submit" style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Send</button>
              </form>
            </div>

            {/* Overworld Party Menu */}
            {showParty && !isBattling && (
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }}>
                <PartyMenu
                  party={party}
                  onClose={() => setShowParty(false)}
                  isBattleMode={false}
                />
              </div>
            )}

            {/* Overworld Bag */}
            {showBag && !isBattling && (
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 55 }}>
                <BagMenu
                  items={bag}
                  mode="overworld"
                  party={party}
                  onUseItem={(item, monId) => socket?.emit("pkmn_use_item", { item, monId })}
                  onClose={() => setShowBag(false)}
                />
              </div>
            )}

            {/* Menu buttons (top-right) */}
            <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 8, zIndex: 40 }}>
              <button
                onClick={() => { setShowBag(v => !v); socket?.emit("pkmn_get_bag"); socket?.emit("pkmn_get_party"); }}
                style={{ padding: '6px 14px', background: '#f0c030', color: '#222', border: '2px solid #2b2b2b', borderRadius: 6, fontWeight: 800, cursor: 'pointer' }}
              >🎒 Bag</button>
              <button
                onClick={() => { setShowParty(v => !v); socket?.emit("pkmn_get_party"); }}
                style={{ padding: '6px 14px', background: '#58c85a', color: '#fff', border: '2px solid #2b2b2b', borderRadius: 6, fontWeight: 800, cursor: 'pointer' }}
              >Party</button>
            </div>

            {/* Virtual D-Pad Overlay (bottom right) */}
            <div style={{ position: 'absolute', bottom: 16, right: 16, display: 'grid', gridTemplateColumns: 'repeat(3, 40px)', gridTemplateRows: 'repeat(3, 40px)', gap: 4 }}>
              <div />
              <button 
                onMouseDown={() => handleDpadDown('up')} onMouseUp={handleDpadUp} onMouseLeave={handleDpadUp}
                onTouchStart={(e) => { e.preventDefault(); handleDpadDown('up'); }} onTouchEnd={handleDpadUp}
                style={{ background: 'rgba(255,255,255,0.7)', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 20 }}>↑</button>
              <div />
              
              <button 
                onMouseDown={() => handleDpadDown('left')} onMouseUp={handleDpadUp} onMouseLeave={handleDpadUp}
                onTouchStart={(e) => { e.preventDefault(); handleDpadDown('left'); }} onTouchEnd={handleDpadUp}
                style={{ background: 'rgba(255,255,255,0.7)', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 20 }}>←</button>
              <button style={{ background: 'rgba(255,255,255,0.3)', border: 'none', borderRadius: 4 }}></button>
              <button 
                onMouseDown={() => handleDpadDown('right')} onMouseUp={handleDpadUp} onMouseLeave={handleDpadUp}
                onTouchStart={(e) => { e.preventDefault(); handleDpadDown('right'); }} onTouchEnd={handleDpadUp}
                style={{ background: 'rgba(255,255,255,0.7)', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 20 }}>→</button>
              
              <div />
              <button 
                onMouseDown={() => handleDpadDown('down')} onMouseUp={handleDpadUp} onMouseLeave={handleDpadUp}
                onTouchStart={(e) => { e.preventDefault(); handleDpadDown('down'); }} onTouchEnd={handleDpadUp}
                style={{ background: 'rgba(255,255,255,0.7)', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 20 }}>↓</button>
              <div />
            </div>
          </div>
        ) : <p>Loading Map...</p>
      ) : <p>Connecting to World Server...</p>}
    </div>
  );
}
