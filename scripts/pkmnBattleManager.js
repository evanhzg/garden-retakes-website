const { BattleStreams } = require('@pkmn/sim');

// Store active battles by steamId
// value is { stream, p1Team, p2Team }
const activeBattles = new Map();

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
      Hp: 20,
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
 * Generate a random wild Pokemon
 */
function generateWildPokemon(levelStr) {
  const speciesList = ['Pidgey', 'Rattata', 'Caterpie', 'Weedle'];
  const species = speciesList[Math.floor(Math.random() * speciesList.length)];
  const level = parseInt(levelStr) || Math.floor(Math.random() * 3) + 2; // Lv 2-4
  
  return [{
    species: species,
    level: level,
    moves: ['tackle', 'growl'], // simplify
    ability: 'keeneye', // simplify
    nature: 'hardy',
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }
  }];
}

async function startEncounter(socket, steamId, prisma) {
  if (activeBattles.has(steamId)) {
    // Already in battle
    return;
  }

  try {
    const dbTeam = await ensurePlayerTeam(steamId, prisma);
    const p1Team = formatTeamForSim(dbTeam);
    const p2Team = generateWildPokemon();

    const stream = new BattleStreams.BattleStream();
    activeBattles.set(steamId, { stream, p1Team, p2Team, dbTeam });

    // Read output from the battle
    (async () => {
      try {
        for await (const chunk of stream) {
          socket.emit("pkmn_battle_chunk", chunk);
          
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
        activeBattles.delete(steamId);
        socket.emit("pkmn_battle_end");
      }
    })();

    // Initialize battle
    stream.write('>start {"formatid":"gen9customgame"}');
    stream.write(`>player p1 {"name":"Player","team":${JSON.stringify(p1Team)}}`);
    stream.write(`>player p2 {"name":"Wild Pokémon","team":${JSON.stringify(p2Team)}}`);

    socket.emit("pkmn_battle_start", {
      wildPokemon: p2Team[0]
    });
  } catch (err) {
    console.error("Failed to start encounter:", err);
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
        activeBattles.delete(steamId);
        socket.emit("pkmn_battle_end");
      }
    })();

    stream.write('>start {"formatid":"gen9customgame"}');
    stream.write(`>player p1 {"name":"Player","team":${JSON.stringify(p1Team)}}`);
    stream.write(`>player p2 {"name":"${trainerData.name}","team":${JSON.stringify(p2Team)}}`);

    socket.emit("pkmn_battle_start", {
      wildPokemon: p2Team[0],
      trainerName: trainerData.name
    });
  } catch (err) {
    console.error("Failed to start trainer battle:", err);
  }
}

async function handleBattleAction(socket, steamId, actionData, prisma) {
  const battle = activeBattles.get(steamId);
  if (!battle) return;
  const { stream, p2Team } = battle;

  const { type, move, target, switchIdx } = actionData;
  if (type === 'move') {
    stream.write(`>p1 move ${move}`);
    // Wild AI just picks random move
    stream.write(`>p2 move 1`);
  } else if (type === 'switch') {
    stream.write(`>p1 switch ${switchIdx}`);
    stream.write(`>p2 move 1`);
  } else if (type === 'catch') {
    // Basic catch calculation
    // Send a message via stream chunk so the client renders it
    socket.emit("pkmn_battle_chunk", `|message|You threw a Pokéball!`);
    
    // 50% catch rate for testing (we don't parse HP here to keep it simple, just RNG)
    if (Math.random() > 0.5) {
      // Cannot catch trainer pokemon
      if (battle.isTrainer) {
        socket.emit("pkmn_battle_chunk", `|message|You can't catch another trainer's Pokémon!`);
        return;
      }
      
      socket.emit("pkmn_battle_chunk", `|message|Gotcha! ${p2Team[0].species} was caught!`);
      
      await prisma.PkmnMon.create({
        data: {
          OwnerId: BigInt(steamId),
          Species: p2Team[0].species,
          Level: p2Team[0].level,
          Exp: Math.pow(p2Team[0].level, 3), // simple base exp
          Hp: 20, // Max hp generic for now
          Ability: p2Team[0].ability,
          Nature: p2Team[0].nature,
          Moves: JSON.stringify(p2Team[0].moves),
          Ivs: JSON.stringify(p2Team[0].ivs),
          Evs: JSON.stringify(p2Team[0].evs)
        }
      });

      // End battle stream
      stream.write('>p1 default');
      stream.write('>p2 default');
      stream.write('>forcelose p2');
      activeBattles.delete(steamId);
    } else {
      socket.emit("pkmn_battle_chunk", `|message|Oh no! The wild ${p2Team[0].species} broke free!`);
      stream.write(`>p1 default`); // Skip turn
      stream.write(`>p2 move 1`);
    }
  } else if (type === 'run') {
    // End battle stream
    stream.write('>p1 default');
    stream.write('>p2 default');
    stream.write('>forcelose p1'); // Simulate run by forcing lose or just terminating
    activeBattles.delete(steamId);
  }
}

module.exports = {
  startEncounter,
  startTrainerBattle,
  handleBattleAction
};
