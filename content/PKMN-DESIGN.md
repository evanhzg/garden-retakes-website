# Garden PKMN: Technical Design & Architecture

This document serves as the authoritative architectural source of truth for **Phase P: Garden PKMN**, an online multiplayer PokeMMO-style game embedded directly within `pkmn.retakes.fr`.

## Core Technology Stack

After completing Phase P0 (Discovery & Spikes), the following technical decisions have been locked in:

### 1. Battle Engine: `@pkmn/sim`
Instead of attempting to manually code Pokémon moves, types, damage calculations, and edge cases, we are utilizing `@pkmn/sim` running on a Node.js authoritative backend. 
- **Proof of Concept**: We have successfully run a programmatic battle stream pitting a Level 5 Charmander against a Wild Level 3 Pidgey.
- **Client Role**: The browser (React/Phaser) simply acts as a renderer that parses the engine's `|move|`, `|-damage|`, and `|faint|` protocol text streams to animate sprites and update HP bars.
- **Server Role**: The server holds the active `BattleStream` and enforces the rules.

### 2. Overworld Client: `Phaser 3` + `Next.js`
The overworld uses Phaser 3 running inside a dynamically imported React Client Component (`ssr: false`) within our Next.js frontend.
- **Proof of Concept**: We've confirmed 4-directional, grid-snapped movement using Phaser's Arcade Physics.
- **Maps**: We will use **Tiled** to create JSON/TMX tilemaps. Collision layers and encounter zones (e.g., tall grass) will be marked as custom properties on the tiles, which Phaser can parse directly.

### 3. Netcode: `Socket.IO`
To keep the architecture unified, we have rejected adding a bespoke state-sync framework like `Colyseus`. Instead, we will extend the existing `server.js` Socket.IO Games Hub.
- **Rooms**: Players in the same "Map" (e.g., `pallet_town`) will join a Socket.IO room.
- **State Sync**: The server will hold a lightweight `MapState` object tracking X/Y coordinates of all connected trainers. The client will emit `player_move` events, and the server will broadcast `map_update` events containing delta movements.

### 4. Data Authoring: `Custom JSON` + Tiled
We evaluated Pokémon Studio/PSDK but concluded its Ruby/RGSS data formats are too heavy and desktop-centric. Because `@pkmn/sim` already acts as our entire Pokédex and Move database, we only need to author:
- **Tiled Maps**: The physical collision map.
- **`encounters.json`**: An array of zones per map, specifying the encounter rates and possible species + levels.
- **`trainers.json`**: Static NPC teams.

---

## Database Schema (Prisma)

The game requires persistent state tied to the overarching `Garden` account. We will add the following models to our Aiven MySQL database:

```prisma
// Represents a user's persistent save file in the PKMN world
model PkmnTrainer {
  steamId       String    @id @unique
  money         Int       @default(0)
  currentMap    String    @default("pallet_town")
  posX          Int       @default(0)
  posY          Int       @default(0)
  facing        String    @default("down")
  inventory     Json      // { "pokeball": 5, "potion": 2 }
  badges        Json      // Array of earned badge strings

  party         PkmnMon[] @relation("TrainerParty")
  box           PkmnBox[] 
  
  user          User      @relation(fields: [steamId], references: [steamId])
}

// Represents a single instantiated Pokémon (party or box)
model PkmnMon {
  id            String    @id @default(cuid())
  ownerId       String    
  species       String    // e.g. "charmander"
  nickname      String?
  level         Int
  exp           Int
  hp            Int       // Current HP; max is calculated by @pkmn/sim
  status        String?   // "brn", "psn", "slp"
  
  // Base mechanics
  ability       String
  nature        String
  
  // Arrays of 4 moves max
  moves         Json      // ["scratch", "growl"]
  
  // Stats (JSON objects of { hp, atk, def, spa, spd, spe })
  ivs           Json
  evs           Json
  
  // Foreign Keys
  trainer       PkmnTrainer @relation("TrainerParty", fields: [ownerId], references: [steamId])
  box           PkmnBox?    @relation(fields: [boxId], references: [id])
  boxId         String?
}

// PC Storage Box
model PkmnBox {
  id            String    @id @default(cuid())
  ownerId       String
  name          String    @default("Box 1")
  
  pokemon       PkmnMon[]
  trainer       PkmnTrainer @relation(fields: [ownerId], references: [steamId])
}
```

## Next Steps (Phase P1)

With P0 Spikes finished, we are ready to begin **P1: World Server v1**. 
This involves wiring up `server.js` to accept `pkmn_join` events and manage authoritative server-side X/Y coordinate validation for players on a map.
