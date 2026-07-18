const { BattleStreams } = require('@pkmn/sim');
const { ITEMS, STARTER_ITEMS, maxHpFor, parseInv, buildBagList } = require('./pkmnItems');

// Store active battles by steamId
// value is { stream, p1Team, p2Team, enemyHpFrac }
const activeBattles = new Map();

// Re-enable the client's action buttons after a "free" battle action (an
// item that didn't consume the turn), since no |turn| chunk will arrive.
const reEnable = (socket) => socket.emit("pkmn_can_act");

async function saveInventory(prisma, steamId, inv) {
  await prisma.pkmnTrainer.update({
    where: { SteamId: BigInt(steamId) },
    data: { Inventory: JSON.stringify(inv) },
  });
  return inv;
}

/** Save the player's lead mon's ending HP so overworld HP / potions stay meaningful. */
async function persistActiveHp(stream, dbTeam, prisma) {
  try {
    const poke = stream?.battle?.p1?.active?.[0];
    const mon = dbTeam?.[0];
    if (poke && mon && typeof poke.hp === 'number') {
      await prisma.PkmnMon.update({
        where: { Id: mon.Id },
        data: { Hp: Math.max(0, Math.round(poke.hp)) },
      });
    }
  } catch {
    /* best effort */
  }
}

// Level-appropriate movesets (kept static and small on purpose — @pkmn/sim
// validates them; extend alongside the encounter tables).
const SPECIES_MOVES = {
  Pidgey: ['tackle', 'sandattack', 'gust', 'quickattack'],
  Rattata: ['tackle', 'tailwhip', 'quickattack', 'bite'],
  Caterpie: ['tackle', 'stringshot', 'bugbite'],
  Weedle: ['poisonsting', 'stringshot', 'bugbite'],
  Pikachu: ['thundershock', 'growl', 'quickattack', 'tailwhip'],
  Spearow: ['peck', 'growl', 'leer', 'furyattack'],
  Nidoranf: ['scratch', 'growl', 'tailwhip', 'poisonsting'],
  Nidoranm: ['peck', 'leer', 'tackle', 'poisonsting'],
  Oddish: ['absorb', 'growl', 'acid'],
  Mankey: ['scratch', 'leer', 'lowkick', 'furyswipes'],
  Bulbasaur: ['tackle', 'growl', 'vinewhip', 'leechseed'],
  Charmander: ['scratch', 'growl', 'ember', 'smokescreen'],
  Squirtle: ['tackle', 'tailwhip', 'watergun', 'withdraw'],
};

const movesFor = (species) => SPECIES_MOVES[species] || ['tackle', 'growl'];

// Per-map wild encounter tables: weight = relative chance, min/max = levels.
const WILD_TABLES = {
  pallet_town: [
    { species: 'Pidgey', weight: 30, min: 2, max: 4 },
    { species: 'Rattata', weight: 30, min: 2, max: 4 },
    { species: 'Caterpie', weight: 15, min: 2, max: 3 },
    { species: 'Weedle', weight: 15, min: 2, max: 3 },
    { species: 'Oddish', weight: 6, min: 3, max: 4 },
    { species: 'Pikachu', weight: 4, min: 3, max: 5 },
  ],
  default: [
    { species: 'Pidgey', weight: 25, min: 2, max: 5 },
    { species: 'Rattata', weight: 25, min: 2, max: 5 },
    { species: 'Spearow', weight: 15, min: 3, max: 5 },
    { species: 'Mankey', weight: 10, min: 3, max: 5 },
    { species: 'Nidoranf', weight: 10, min: 3, max: 5 },
    { species: 'Nidoranm', weight: 10, min: 3, max: 5 },
    { species: 'Pikachu', weight: 5, min: 3, max: 6 },
  ],
};

const STARTERS = ['Bulbasaur', 'Charmander', 'Squirtle'];

async function createStarter(prisma, steamId, species) {
  if (!STARTERS.includes(species)) return null;
  const existing = await prisma.PkmnMon.count({ where: { OwnerId: BigInt(steamId) } });
  if (existing > 0) return null; // starters are once per trainer
  const mon = await prisma.PkmnMon.create({
    data: {
      OwnerId: BigInt(steamId),
      Species: species,
      Level: 5,
      Exp: 125,
      Hp: maxHpFor(species, 5, 31),
      Ability: species === 'Bulbasaur' ? 'overgrow' : species === 'Charmander' ? 'blaze' : 'torrent',
      Nature: 'hardy',
      Moves: JSON.stringify(movesFor(species)),
      Ivs: JSON.stringify({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }),
      Evs: JSON.stringify({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 })
    }
  });

  // Stock the new trainer's bag (best effort — trainer row exists by now).
  try {
    const trainer = await prisma.pkmnTrainer.findUnique({ where: { SteamId: BigInt(steamId) } });
    const inv = parseInv(trainer?.Inventory);
    for (const [id, n] of Object.entries(STARTER_ITEMS)) inv[id] = (inv[id] || 0) + n;
    await saveInventory(prisma, steamId, inv);
  } catch (e) {
    console.error('PKMN: failed to grant starter items', e);
  }

  return mon;
}

/**
 * Ensures the player has at least one Pokemon. 
 * If not, gives them a Level 5 Charmander.
 */
async function ensurePlayerTeam(steamId, prisma) {
  const mons = await prisma.PkmnMon.findMany({
    where: { OwnerId: BigInt(steamId) },
  });

  if (mons.length > 0) {
    return mons;
  }

  // Give a starter
  const starter = await prisma.PkmnMon.create({
    data: {
      OwnerId: BigInt(steamId),
      Species: 'Charmander',
      Level: 5,
      Exp: 0,
      Hp: maxHpFor('Charmander', 5, 31),
      Ability: 'blaze',
      Nature: 'hardy',
      Moves: JSON.stringify(['scratch', 'growl']),
      Ivs: JSON.stringify({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }),
      Evs: JSON.stringify({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 })
    }
  });

  return [starter];
}

/**
 * Format DB mons to @pkmn/sim team format
 */
function formatTeamForSim(mons) {
  return mons.map(m => ({
    species: m.Species,
    level: m.Level,
    moves: JSON.parse(m.Moves),
    ability: m.Ability,
    nature: m.Nature,
    evs: JSON.parse(m.Evs),
    ivs: JSON.parse(m.Ivs)
  }));
}

/**
 * Roll a wild Pokemon from the map's encounter table.
 */
function generateWildPokemon(mapId) {
  const table = WILD_TABLES[mapId] || WILD_TABLES.default;
  const total = table.reduce((s, e) => s + e.weight, 0);
  let roll = Math.random() * total;
  let entry = table[table.length - 1];
  for (const e of table) {
    roll -= e.weight;
    if (roll <= 0) { entry = e; break; }
  }
  const level = entry.min + Math.floor(Math.random() * (entry.max - entry.min + 1));

  return [{
    species: entry.species,
    level,
    moves: movesFor(entry.species),
    ability: 'keeneye', // simplify
    nature: 'hardy',
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }
  }];
}

async function startEncounter(socket, steamId, prisma, mapId) {
  if (activeBattles.has(steamId)) {
    // Already in battle
    return;
  }

  try {
    const dbTeam = await ensurePlayerTeam(steamId, prisma);
    const p1Team = formatTeamForSim(dbTeam);
    const p2Team = generateWildPokemon(mapId);

    const stream = new BattleStreams.BattleStream();
    const battle = { stream, p1Team, p2Team, dbTeam, enemyHpFrac: 1 };
    activeBattles.set(steamId, battle);

    // Read output from the battle
    (async () => {
      try {
        for await (const chunk of stream) {
          socket.emit("pkmn_battle_chunk", chunk);

          // Track the wild mon's HP fraction so catch odds scale with damage
          for (const line of chunk.split('\n')) {
            const m = line.match(/^\|-damage\|p2a[^|]*\|(\d+)\/(\d+)/);
            if (m) battle.enemyHpFrac = parseInt(m[1]) / parseInt(m[2]);
            if (line.startsWith('|faint|p2a')) battle.enemyHpFrac = 0;
          }

          // Auto-pick teams at start
          if (chunk.includes('teampreview')) {
            stream.write('>p1 team 1');
            stream.write('>p2 team 1');
          }

          // XP Gain logic
          if (chunk.includes('|win|Player')) {
            // Player won against wild pokemon
            const wildLevel = p2Team[0].level;
            const xpGained = wildLevel * 10;
            const activeMon = dbTeam[0]; // Assuming first mon is active for now
            
            activeMon.Exp += xpGained;
            const newLevel = Math.floor(Math.cbrt(activeMon.Exp)); // Simple XP curve
            
            socket.emit("pkmn_battle_chunk", `|message|${activeMon.Species} gained ${xpGained} XP!`);

            if (newLevel > activeMon.Level) {
              activeMon.Level = newLevel;
              socket.emit("pkmn_battle_chunk", `|message|${activeMon.Species} grew to level ${newLevel}!`);
            }

            await prisma.PkmnMon.update({
              where: { Id: activeMon.Id },
              data: { Exp: activeMon.Exp, Level: activeMon.Level }
            });
          }
        }
      } catch (err) {
        console.error("Battle stream error:", err);
      } finally {
        await persistActiveHp(stream, dbTeam, prisma);
        activeBattles.delete(steamId);
        socket.emit("pkmn_battle_end");
      }
    })();

    // Initialize battle
    stream.write('>start {"formatid":"gen9customgame"}');
    stream.write(`>player p1 {"name":"Player","team":${JSON.stringify(p1Team)}}`);
    stream.write(`>player p2 {"name":"Wild Pokémon","team":${JSON.stringify(p2Team)}}`);

    socket.emit("pkmn_battle_start", {
      wildPokemon: p2Team[0],
      playerPokemon: {
        species: dbTeam[0].Species,
        level: dbTeam[0].Level,
        moves: JSON.parse(dbTeam[0].Moves),
        nickname: dbTeam[0].Nickname || null,
        maxHp: maxHpFor(dbTeam[0].Species, dbTeam[0].Level, 31),
      },
      party: dbTeam.map(m => ({ species: m.Species, level: m.Level })),
    });
  } catch (err) {
    console.error("Failed to start encounter:", err);
    activeBattles.delete(steamId);
    socket.emit("pkmn_battle_end");
  }
}

async function startTrainerBattle(socket, steamId, prisma, trainerData) {
  if (activeBattles.has(steamId)) return;

  try {
    const dbTeam = await ensurePlayerTeam(steamId, prisma);
    const p1Team = formatTeamForSim(dbTeam);
    const p2Team = trainerData.team;

    const stream = new BattleStreams.BattleStream();
    activeBattles.set(steamId, { stream, p1Team, p2Team, dbTeam, isTrainer: true });

    (async () => {
      try {
        for await (const chunk of stream) {
          socket.emit("pkmn_battle_chunk", chunk);
          if (chunk.includes('teampreview')) {
            stream.write('>p1 team 1');
            stream.write('>p2 team 1');
          }
          if (chunk.includes('|win|Player')) {
            // Give flat XP for trainer battles for now
            const xpGained = 50;
            const activeMon = dbTeam[0];
            activeMon.Exp += xpGained;
            const newLevel = Math.floor(Math.cbrt(activeMon.Exp));
            
            socket.emit("pkmn_battle_chunk", `|message|${activeMon.Species} gained ${xpGained} XP!`);
            if (newLevel > activeMon.Level) {
              activeMon.Level = newLevel;
              socket.emit("pkmn_battle_chunk", `|message|${activeMon.Species} grew to level ${newLevel}!`);
            }
            await prisma.PkmnMon.update({
              where: { Id: activeMon.Id },
              data: { Exp: activeMon.Exp, Level: activeMon.Level }
            });
          }
        }
      } catch (err) {
        console.error("Battle stream error:", err);
      } finally {
        await persistActiveHp(stream, dbTeam, prisma);
        activeBattles.delete(steamId);
        socket.emit("pkmn_battle_end");
      }
    })();

    stream.write('>start {"formatid":"gen9customgame"}');
    stream.write(`>player p1 {"name":"Player","team":${JSON.stringify(p1Team)}}`);
    stream.write(`>player p2 {"name":"${trainerData.name}","team":${JSON.stringify(p2Team)}}`);

    socket.emit("pkmn_battle_start", {
      wildPokemon: p2Team[0],
      trainerName: trainerData.name,
      playerPokemon: {
        species: dbTeam[0].Species,
        level: dbTeam[0].Level,
        moves: JSON.parse(dbTeam[0].Moves),
        nickname: dbTeam[0].Nickname || null,
        maxHp: maxHpFor(dbTeam[0].Species, dbTeam[0].Level, 31),
      },
    });
  } catch (err) {
    console.error("Failed to start trainer battle:", err);
    activeBattles.delete(steamId);
    socket.emit("pkmn_battle_end");
  }
}

async function handleBattleAction(socket, steamId, actionData, prisma) {
  const battle = activeBattles.get(steamId);
  if (!battle) return;
  const { stream } = battle;

  const { type, move, switchIdx } = actionData;
  if (type === 'move') {
    stream.write(`>p1 move ${move}`);
    stream.write(`>p2 move 1`); // wild AI: first move
  } else if (type === 'switch') {
    stream.write(`>p1 switch ${switchIdx}`);
    stream.write(`>p2 move 1`);
  } else if (type === 'catch') {
    // Legacy quick-throw (no explicit ball) — a plain Poké Ball, consumes the turn.
    await throwBall(socket, steamId, prisma, battle, ITEMS['poke-ball']);
  } else if (type === 'item') {
    await useBattleItem(socket, steamId, prisma, battle, actionData.item);
  } else if (type === 'run') {
    stream.write('>p1 default');
    stream.write('>p2 default');
    stream.write('>forcelose p1');
    activeBattles.delete(steamId);
  }
}

/** BAG → a ball or a potion during battle. Balls cost the turn; potions are free (finite by count). */
async function useBattleItem(socket, steamId, prisma, battle, itemId) {
  const item = ITEMS[itemId];
  if (!item) return reEnable(socket);

  // Verify + consume from the trainer's bag.
  let inv;
  try {
    const trainer = await prisma.pkmnTrainer.findUnique({ where: { SteamId: BigInt(steamId) } });
    inv = parseInv(trainer?.Inventory);
  } catch {
    return reEnable(socket);
  }
  if (!inv[itemId] || inv[itemId] <= 0) {
    socket.emit("pkmn_battle_chunk", `|message|You have no ${item.name} left!`);
    return reEnable(socket);
  }

  if (item.kind === 'ball') {
    inv[itemId] -= 1;
    if (inv[itemId] <= 0) delete inv[itemId];
    await saveInventory(prisma, steamId, inv).catch(() => {});
    socket.emit("pkmn_bag_data", buildBagList(inv));
    await throwBall(socket, steamId, prisma, battle, item);
    return;
  }

  if (item.kind === 'heal') {
    const poke = battle.stream?.battle?.p1?.active?.[0];
    if (!poke || poke.fainted) {
      socket.emit("pkmn_battle_chunk", `|message|It won't have any effect now.`);
      return reEnable(socket);
    }
    if (poke.hp >= poke.maxhp) {
      socket.emit("pkmn_battle_chunk", `|message|${poke.name} is already at full HP.`);
      return reEnable(socket);
    }
    const before = poke.hp;
    poke.hp = Math.min(poke.maxhp, poke.hp + item.heal);
    inv[itemId] -= 1;
    if (inv[itemId] <= 0) delete inv[itemId];
    await saveInventory(prisma, steamId, inv).catch(() => {});
    // Drive the client HP bar + bag through the normal channels.
    socket.emit("pkmn_battle_chunk", `|-heal|p1a: ${poke.name}|${poke.hp}/${poke.maxhp}|`);
    socket.emit("pkmn_battle_chunk", `|message|Used ${item.name}! Restored ${poke.hp - before} HP.`);
    socket.emit("pkmn_bag_data", buildBagList(inv));
    reEnable(socket); // free action — turn not consumed
  }
}

/** Shared catch resolution. Odds scale with the wild mon's remaining HP × the ball modifier. */
async function throwBall(socket, steamId, prisma, battle, ball) {
  const { stream, p2Team } = battle;
  socket.emit("pkmn_battle_chunk", `|message|You threw a ${ball.name}!`);

  if (battle.isTrainer) {
    socket.emit("pkmn_battle_chunk", `|message|You can't catch another trainer's Pokémon!`);
    return reEnable(socket);
  }

  const frac = battle.enemyHpFrac ?? 1;
  const chance = Math.min(0.95, (0.25 + 0.65 * (1 - frac)) * (ball.catch ?? 1));
  if (Math.random() < chance) {
    socket.emit("pkmn_battle_chunk", `|message|Gotcha! ${p2Team[0].species} was caught!`);
    try {
      await prisma.PkmnMon.create({
        data: {
          OwnerId: BigInt(steamId),
          Species: p2Team[0].species,
          Level: p2Team[0].level,
          Exp: Math.pow(p2Team[0].level, 3),
          Hp: maxHpFor(p2Team[0].species, p2Team[0].level, p2Team[0].ivs?.hp ?? 15),
          Ability: p2Team[0].ability,
          Nature: p2Team[0].nature,
          Moves: JSON.stringify(p2Team[0].moves),
          Ivs: JSON.stringify(p2Team[0].ivs),
          Evs: JSON.stringify(p2Team[0].evs),
        },
      });
    } catch (e) {
      console.error('PKMN: failed to store caught mon', e);
    }
    stream.write('>p1 default');
    stream.write('>p2 default');
    stream.write('>forcelose p2');
    activeBattles.delete(steamId);
  } else {
    socket.emit("pkmn_battle_chunk", `|message|Oh no! The wild ${p2Team[0].species} broke free!`);
    stream.write('>p1 default'); // throwing a ball costs the turn
    stream.write('>p2 move 1');
  }
}

module.exports = {
  startEncounter,
  startTrainerBattle,
  handleBattleAction,
  createStarter,
  STARTERS
};
