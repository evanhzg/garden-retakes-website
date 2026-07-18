// Garden PKMN — item catalog, bag helpers and HP maths.
// Shared by the socket server (overworld bag) and the battle manager (in-battle bag).

const { Dex } = require('@pkmn/dex');

// Small, deliberately-curated catalog. kind drives behaviour:
//   ball → throw to catch (catch multiplier), heal → restore HP.
const ITEMS = {
  'poke-ball':    { name: 'Poké Ball',    kind: 'ball', catch: 1.0,  desc: 'A device for catching wild Pokémon.' },
  'great-ball':   { name: 'Great Ball',   kind: 'ball', catch: 1.5,  desc: 'A good, high-performance Poké Ball.' },
  'ultra-ball':   { name: 'Ultra Ball',   kind: 'ball', catch: 2.0,  desc: 'An ultra-performance Poké Ball.' },
  'potion':       { name: 'Potion',       kind: 'heal', heal: 20,    desc: 'Restores 20 HP to one Pokémon.' },
  'super-potion': { name: 'Super Potion', kind: 'heal', heal: 50,    desc: 'Restores 50 HP to one Pokémon.' },
  'hyper-potion': { name: 'Hyper Potion', kind: 'heal', heal: 120,   desc: 'Restores 120 HP to one Pokémon.' },
};

// What a fresh trainer starts their bag with.
const STARTER_ITEMS = { 'poke-ball': 5, 'potion': 3 };

/** Real max-HP from the species base stat (Gen-3+ formula). */
function maxHpFor(species, level, ivHp = 15, evHp = 0) {
  let base = 45;
  try {
    const s = Dex.species.get(species);
    if (s && s.exists && s.baseStats) base = s.baseStats.hp;
  } catch {
    /* unknown species — keep the fallback */
  }
  return Math.floor(((2 * base + ivHp + Math.floor(evHp / 4)) * level) / 100) + level + 10;
}

/** Max HP for a stored PkmnMon row (reads its IVs). */
function maxHpForMon(mon) {
  let ivHp = 15;
  try { ivHp = JSON.parse(mon.Ivs || '{}').hp ?? 15; } catch { /* default */ }
  return maxHpFor(mon.Species, mon.Level, ivHp);
}

function parseInv(json) {
  try { return JSON.parse(json || '{}') || {}; } catch { return {}; }
}

/** Turn a raw inventory map into the client-facing bag list. */
function buildBagList(inv) {
  return Object.entries(inv)
    .filter(([id, count]) => ITEMS[id] && count > 0)
    .map(([id, count]) => ({ id, count, name: ITEMS[id].name, kind: ITEMS[id].kind, desc: ITEMS[id].desc }));
}

module.exports = { ITEMS, STARTER_ITEMS, maxHpFor, maxHpForMon, parseInv, buildBagList };
