// Board definitions + validation (CommonJS — shared by server.js and
// monopolyLogic.js). A board is plain data: the engine builds its runtime board
// from `tiles`, and the client renders any board purely from the state the
// server broadcasts (board tiles + boardMeta).
//
// Card actions reuse the stable ids in components/games/monopolyData.ts, so no
// new client text is ever needed. "classic" reproduces the original board and
// decks exactly; boards without their own `decks` use DEFAULT_* (a position-
// agnostic subset that already has EN/FR text).

// ---------------------------------------------------------------------------
// Classic (US) board — the exact tiles/prices/rents the game shipped with.
// ---------------------------------------------------------------------------
const CLASSIC_TILES = [
  { id: 0, name: 'GO', type: 'corner' },
  { id: 1, name: 'Mediterranean Avenue', type: 'property', group: 'brown', price: 60, rent: [2, 10, 30, 90, 160, 250], houseCost: 50 },
  { id: 2, name: 'Community Chest', type: 'chest' },
  { id: 3, name: 'Baltic Avenue', type: 'property', group: 'brown', price: 60, rent: [4, 20, 60, 180, 320, 450], houseCost: 50 },
  { id: 4, name: 'Income Tax', type: 'tax', amount: 200 },
  { id: 5, name: 'Reading Railroad', type: 'rail', group: 'rail', price: 200, rent: [25, 50, 100, 200] },
  { id: 6, name: 'Oriental Avenue', type: 'property', group: 'lightblue', price: 100, rent: [6, 30, 90, 270, 400, 550], houseCost: 50 },
  { id: 7, name: 'Chance', type: 'chance' },
  { id: 8, name: 'Vermont Avenue', type: 'property', group: 'lightblue', price: 100, rent: [6, 30, 90, 270, 400, 550], houseCost: 50 },
  { id: 9, name: 'Connecticut Avenue', type: 'property', group: 'lightblue', price: 120, rent: [8, 40, 100, 300, 450, 600], houseCost: 50 },
  { id: 10, name: 'Jail', type: 'corner' },
  { id: 11, name: 'St. Charles Place', type: 'property', group: 'pink', price: 140, rent: [10, 50, 150, 450, 625, 750], houseCost: 100 },
  { id: 12, name: 'Electric Company', type: 'util', group: 'util', price: 150 },
  { id: 13, name: 'States Avenue', type: 'property', group: 'pink', price: 140, rent: [10, 50, 150, 450, 625, 750], houseCost: 100 },
  { id: 14, name: 'Virginia Avenue', type: 'property', group: 'pink', price: 160, rent: [12, 60, 180, 500, 700, 900], houseCost: 100 },
  { id: 15, name: 'Pennsylvania Railroad', type: 'rail', group: 'rail', price: 200, rent: [25, 50, 100, 200] },
  { id: 16, name: 'St. James Place', type: 'property', group: 'orange', price: 180, rent: [14, 70, 200, 550, 750, 950], houseCost: 100 },
  { id: 17, name: 'Community Chest', type: 'chest' },
  { id: 18, name: 'Tennessee Avenue', type: 'property', group: 'orange', price: 180, rent: [14, 70, 200, 550, 750, 950], houseCost: 100 },
  { id: 19, name: 'New York Avenue', type: 'property', group: 'orange', price: 200, rent: [16, 80, 220, 600, 800, 1000], houseCost: 100 },
  { id: 20, name: 'Free Parking', type: 'corner' },
  { id: 21, name: 'Kentucky Avenue', type: 'property', group: 'red', price: 220, rent: [18, 90, 250, 700, 875, 1050], houseCost: 150 },
  { id: 22, name: 'Chance', type: 'chance' },
  { id: 23, name: 'Indiana Avenue', type: 'property', group: 'red', price: 220, rent: [18, 90, 250, 700, 875, 1050], houseCost: 150 },
  { id: 24, name: 'Illinois Avenue', type: 'property', group: 'red', price: 240, rent: [20, 100, 300, 750, 925, 1100], houseCost: 150 },
  { id: 25, name: 'B. & O. Railroad', type: 'rail', group: 'rail', price: 200, rent: [25, 50, 100, 200] },
  { id: 26, name: 'Atlantic Avenue', type: 'property', group: 'yellow', price: 260, rent: [22, 110, 330, 800, 975, 1150], houseCost: 150 },
  { id: 27, name: 'Ventnor Avenue', type: 'property', group: 'yellow', price: 260, rent: [22, 110, 330, 800, 975, 1150], houseCost: 150 },
  { id: 28, name: 'Water Works', type: 'util', group: 'util', price: 150 },
  { id: 29, name: 'Marvin Gardens', type: 'property', group: 'yellow', price: 280, rent: [24, 120, 360, 850, 1025, 1200], houseCost: 150 },
  { id: 30, name: 'Go To Jail', type: 'corner' },
  { id: 31, name: 'Pacific Avenue', type: 'property', group: 'green', price: 300, rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200 },
  { id: 32, name: 'North Carolina Avenue', type: 'property', group: 'green', price: 300, rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200 },
  { id: 33, name: 'Community Chest', type: 'chest' },
  { id: 34, name: 'Pennsylvania Avenue', type: 'property', group: 'green', price: 320, rent: [28, 150, 450, 1000, 1200, 1400], houseCost: 200 },
  { id: 35, name: 'Short Line Railroad', type: 'rail', group: 'rail', price: 200, rent: [25, 50, 100, 200] },
  { id: 36, name: 'Chance', type: 'chance' },
  { id: 37, name: 'Park Place', type: 'property', group: 'blue', price: 350, rent: [35, 175, 500, 1100, 1300, 1500], houseCost: 200 },
  { id: 38, name: 'Luxury Tax', type: 'tax', amount: 100 },
  { id: 39, name: 'Boardwalk', type: 'property', group: 'blue', price: 400, rent: [50, 200, 600, 1400, 1700, 2000], houseCost: 200 },
];

// Exact classic decks (absolute positions are valid for this board only).
const CLASSIC_CHANCE = [
  { id: 'ch_go',        action: 'move_to',     pos: 0,  collectGo: false },
  { id: 'ch_illinois',  action: 'move_to',     pos: 24, collectGo: true },
  { id: 'ch_charles',   action: 'move_to',     pos: 11, collectGo: true },
  { id: 'ch_util',      action: 'nearest_util' },
  { id: 'ch_rail',      action: 'nearest_rail' },
  { id: 'ch_dividend',  action: 'collect',     amount: 50 },
  { id: 'ch_gojf',      action: 'gojf' },
  { id: 'ch_back3',     action: 'move_by',     steps: -3 },
  { id: 'ch_jail',      action: 'jail' },
  { id: 'ch_repairs',   action: 'repairs',     perHouse: 25, perHotel: 100 },
  { id: 'ch_speeding',  action: 'pay',         amount: 15 },
  { id: 'ch_reading',   action: 'move_to',     pos: 5,  collectGo: true },
  { id: 'ch_boardwalk', action: 'move_to',     pos: 39, collectGo: false },
  { id: 'ch_chairman',  action: 'pay_each',    amount: 50 },
  { id: 'ch_loan',      action: 'collect',     amount: 150 },
  { id: 'ch_crossword', action: 'collect',     amount: 100 },
];
const CLASSIC_CHEST = [
  { id: 'cc_go',        action: 'move_to',     pos: 0,  collectGo: false },
  { id: 'cc_bankerror', action: 'collect',     amount: 200 },
  { id: 'cc_doctor',    action: 'pay',         amount: 50 },
  { id: 'cc_stock',     action: 'collect',     amount: 50 },
  { id: 'cc_gojf',      action: 'gojf' },
  { id: 'cc_jail',      action: 'jail' },
  { id: 'cc_holiday',   action: 'collect',     amount: 100 },
  { id: 'cc_taxrefund', action: 'collect',     amount: 20 },
  { id: 'cc_birthday',  action: 'collect_each', amount: 10 },
  { id: 'cc_lifeins',   action: 'collect',     amount: 100 },
  { id: 'cc_hospital',  action: 'pay',         amount: 50 },
  { id: 'cc_school',    action: 'pay',         amount: 50 },
  { id: 'cc_consult',   action: 'collect',     amount: 25 },
  { id: 'cc_streets',   action: 'repairs',     perHouse: 40, perHotel: 115 },
  { id: 'cc_beauty',    action: 'collect',     amount: 10 },
  { id: 'cc_inherit',   action: 'collect',     amount: 100 },
];

// Position-agnostic default decks for any non-classic board (all ids already
// have client text; `move_to_go` resolves to the board's GO role).
const DEFAULT_CHANCE = [
  { id: 'ch_go',        action: 'move_to_go' },
  { id: 'ch_util',      action: 'nearest_util' },
  { id: 'ch_rail',      action: 'nearest_rail' },
  { id: 'ch_dividend',  action: 'collect',  amount: 50 },
  { id: 'ch_gojf',      action: 'gojf' },
  { id: 'ch_back3',     action: 'move_by',  steps: -3 },
  { id: 'ch_jail',      action: 'jail' },
  { id: 'ch_repairs',   action: 'repairs',  perHouse: 25, perHotel: 100 },
  { id: 'ch_speeding',  action: 'pay',      amount: 15 },
  { id: 'ch_chairman',  action: 'pay_each', amount: 50 },
  { id: 'ch_loan',      action: 'collect',  amount: 150 },
  { id: 'ch_crossword', action: 'collect',  amount: 100 },
];
const DEFAULT_CHEST = [
  { id: 'cc_go',        action: 'move_to_go' },
  { id: 'cc_bankerror', action: 'collect',  amount: 200 },
  { id: 'cc_doctor',    action: 'pay',      amount: 50 },
  { id: 'cc_stock',     action: 'collect',  amount: 50 },
  { id: 'cc_gojf',      action: 'gojf' },
  { id: 'cc_jail',      action: 'jail' },
  { id: 'cc_holiday',   action: 'collect',  amount: 100 },
  { id: 'cc_taxrefund', action: 'collect',  amount: 20 },
  { id: 'cc_birthday',  action: 'collect_each', amount: 10 },
  { id: 'cc_lifeins',   action: 'collect',  amount: 100 },
  { id: 'cc_hospital',  action: 'pay',      amount: 50 },
  { id: 'cc_school',    action: 'pay',      amount: 50 },
  { id: 'cc_consult',   action: 'collect',  amount: 25 },
  { id: 'cc_streets',   action: 'repairs',  perHouse: 40, perHotel: 115 },
  { id: 'cc_beauty',    action: 'collect',  amount: 10 },
  { id: 'cc_inherit',   action: 'collect',  amount: 100 },
];

// ---------------------------------------------------------------------------
// Business Tour — same 40-tile square structure (prices/rents/groups mirror the
// classic economy), reskinned as a fast world tour with a cooler tech theme,
// higher starting cash and a bigger GO bonus for a snappier game.
// ---------------------------------------------------------------------------
const BT_NAMES = {
  1: 'Cairo', 3: 'Casablanca',
  5: 'Heathrow Airport', 6: 'Bangkok', 8: 'Jakarta', 9: 'Manila',
  11: 'Istanbul', 12: 'Solar Grid', 13: 'Cape Town', 14: 'Nairobi',
  15: 'JFK Airport', 16: 'Rio', 18: 'Buenos Aires', 19: 'Lima',
  21: 'Mumbai', 23: 'New Delhi', 24: 'Dubai',
  25: 'Changi Airport', 26: 'Shanghai', 27: 'Seoul', 28: 'Water Works', 29: 'Beijing',
  31: 'Sydney', 32: 'Toronto', 34: 'Singapore',
  35: 'Haneda Airport', 37: 'Zürich', 39: 'Monaco',
  4: 'City Tax', 38: 'Luxury Levy',
};
const BT_TILES = CLASSIC_TILES.map((t) => ({ ...t, name: BT_NAMES[t.id] || t.name }));

const BOARDS = {
  classic: {
    id: 'classic',
    name: 'Classic Monopoly',
    perSide: 9,
    startingMoney: 1500,
    passGo: 200,
    roles: { go: 0, jail: 10, goToJail: 30, freeParking: 20 },
    currency: { symbol: '$', position: 'prefix' },
    theme: {
      groupColors: {
        brown: '#7b4a12', lightblue: '#8fd0ef', pink: '#d63b8f', orange: '#ef8c1c',
        red: '#e2231a', yellow: '#f4d200', green: '#1f9e4a', blue: '#1f5fd0',
        rail: '#2b3444', util: '#8aa0b8',
      },
      tileBase: '#f4efdf', tileBaseCorner: '#eae3cd',
      plinth: '#0a1a12', field: '#0c3b28', accent: '#22c55e',
    },
    tiles: CLASSIC_TILES,
    decks: { chance: CLASSIC_CHANCE, chest: CLASSIC_CHEST },
  },

  businesstour: {
    id: 'businesstour',
    name: 'Business Tour',
    perSide: 9,
    startingMoney: 2000,
    passGo: 300,
    roles: { go: 0, jail: 10, goToJail: 30, freeParking: 20 },
    currency: { symbol: '€', position: 'suffix' },
    theme: {
      groupColors: {
        brown: '#b45309', lightblue: '#38bdf8', pink: '#f472b6', orange: '#fb923c',
        red: '#ef4444', yellow: '#facc15', green: '#34d399', blue: '#6366f1',
        rail: '#334155', util: '#64748b',
      },
      tileBase: '#eef2f7', tileBaseCorner: '#dfe6ef',
      plinth: '#0b1220', field: '#0e2a4a', accent: '#38bdf8',
    },
    tiles: BT_TILES,
    // no `decks` → DEFAULT_* used.
  },
};

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
function getBoard(id) {
  return BOARDS[id] || BOARDS.classic;
}

function boardSummaries() {
  return Object.values(BOARDS).map((b) => ({
    id: b.id,
    name: b.name,
    tileCount: b.tiles.length,
    accent: b.theme.accent,
    groupColors: b.theme.groupColors,
  }));
}

const TILE_TYPES = new Set(['corner', 'property', 'rail', 'util', 'tax', 'chance', 'chest']);

// Validate a (possibly user-authored) board definition. Returns { ok, error }.
function validateBoard(def) {
  if (!def || typeof def !== 'object') return { ok: false, error: 'not an object' };
  const perSide = def.perSide;
  if (!Number.isInteger(perSide) || perSide < 3 || perSide > 15) return { ok: false, error: 'perSide must be 3–15' };
  const expected = perSide * 4 + 4;
  if (!Array.isArray(def.tiles) || def.tiles.length !== expected) {
    return { ok: false, error: `expected ${expected} tiles, got ${def.tiles && def.tiles.length}` };
  }
  const roles = def.roles || {};
  for (const r of ['go', 'jail', 'goToJail', 'freeParking']) {
    if (!Number.isInteger(roles[r]) || roles[r] < 0 || roles[r] >= expected) {
      return { ok: false, error: `role ${r} out of range` };
    }
  }
  for (let i = 0; i < def.tiles.length; i++) {
    const t = def.tiles[i];
    if (!t || !TILE_TYPES.has(t.type)) return { ok: false, error: `tile ${i} has invalid type` };
    if (t.type === 'property') {
      if (!(t.price > 0) || !Array.isArray(t.rent) || t.rent.length !== 6 || !(t.houseCost > 0)) {
        return { ok: false, error: `property tile ${i} needs price, 6 rents, houseCost` };
      }
    }
    if ((t.type === 'rail' || t.type === 'util') && !(t.price > 0)) {
      return { ok: false, error: `tile ${i} needs a price` };
    }
    if (t.type === 'tax' && !(t.amount > 0)) return { ok: false, error: `tax tile ${i} needs amount` };
  }
  if (!(def.startingMoney > 0) || !(def.passGo >= 0)) return { ok: false, error: 'bad startingMoney/passGo' };
  return { ok: true };
}

module.exports = {
  BOARDS,
  getBoard,
  boardSummaries,
  validateBoard,
  DEFAULT_CHANCE,
  DEFAULT_CHEST,
};
