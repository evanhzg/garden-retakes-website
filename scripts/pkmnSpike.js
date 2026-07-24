const { BattleStreams } = require('@pkmn/sim');

// Define two simple trainers/pokemon
const p1 = {
  name: 'Ash',
  team: [
    { species: 'Charmander', level: 5, moves: ['scratch', 'growl'], ability: 'blaze', nature: 'hardy', evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 } }
  ]
};

const p2 = {
  name: 'Wild Pidgey',
  team: [
    { species: 'Pidgey', level: 3, moves: ['tackle', 'sandattack'], ability: 'keeneye', nature: 'hardy', evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 } }
  ]
};

// Create a battle stream
const stream = new BattleStreams.BattleStream();

// Read output from the battle
(async () => {
  for await (const chunk of stream) {
    console.log("=== BATTLE CHUNK ===");
    console.log(chunk);
    
    // Automatically send moves when a turn is requested
    if (chunk.includes('teampreview')) {
      stream.write('>p1 team 1');
      stream.write('>p2 team 1');
    }
    if (chunk.includes('|turn|1')) {
      stream.write('>p1 move scratch');
      stream.write('>p2 move tackle');
    }
  }
})();

console.log("Starting battle simulation...");

// Initialize battle
stream.write('>start {"formatid":"gen9customgame"}');
stream.write(`>player p1 {"name":"Ash","team":${JSON.stringify(p1.team)}}`);
stream.write(`>player p2 {"name":"Wild Pidgey","team":${JSON.stringify(p2.team)}}`);
