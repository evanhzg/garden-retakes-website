// BUY MENU — the CS2 question bank.
//
// Every question comes from data/cs2Reference.json, which holds game constants
// (prices, kill rewards, team availability, the economy ladder, map callouts)
// rather than balance opinions — so each has exactly one defensible answer.
//
// Tiers: 1 Silver (prices you see every round) → 2 Gold Nova (kill rewards and
// availability) → 3 Eagle (economy maths, callouts) → 4 Global (exact ladder
// values, magazine sizes, edge cases).

const { question } = require("./quizEngine");

const TEAM_LABEL = { ct: "teamCt", t: "teamT", both: "teamBoth" };

const GENERATORS = [
  // ---------------------------------------------------------------- tier 1
  {
    id: "weaponPrice",
    tiers: [1, 2],
    make(rng, { weapons }) {
      const w = rng.pick(weapons);
      const prices = [...new Set(weapons.map((x) => x.price))].filter((p) => Math.abs(p - w.price) >= 200);
      const others = rng.sample(prices, 3);
      if (!others) return null;
      return question({
        type: "mc",
        prompt: { key: "qWeaponPrice", params: { weapon: w.name } },
        choices: [w.price, ...others].map((p) => ({ id: String(p), label: `$${p}` })),
        answer: String(w.price),
        explain: { key: "eWeaponPrice", params: { weapon: w.name, n: w.price } },
      });
    },
  },
  {
    id: "utilityPrice",
    tiers: [1, 2],
    make(rng, { utility, gear }) {
      const all = [...utility, ...gear];
      const u = rng.pick(all);
      const prices = [...new Set(all.map((x) => x.price))].filter((p) => p !== u.price);
      const others = rng.sample(prices, 3);
      if (!others) return null;
      return question({
        type: "mc",
        prompt: { key: "qUtilityPrice", params: { item: u.name } },
        choices: [u.price, ...others].map((p) => ({ id: String(p), label: `$${p}` })),
        answer: String(u.price),
      });
    },
  },
  {
    id: "weaponCategory",
    tiers: [1, 2],
    make(rng, { weapons }) {
      const w = rng.pick(weapons);
      const cats = [...new Set(weapons.map((x) => x.category))].filter((c) => c !== w.category);
      const others = rng.sample(cats, 3);
      if (!others) return null;
      return question({
        type: "mc",
        prompt: { key: "qWeaponCategory", params: { weapon: w.name } },
        choices: [w.category, ...others].map((c) => ({ id: c, label: c })),
        answer: w.category,
      });
    },
  },

  // ---------------------------------------------------------------- tier 2
  {
    id: "killReward",
    tiers: [2, 3],
    make(rng, { weapons }) {
      const w = rng.pick(weapons);
      const rewards = [100, 300, 600, 900].filter((r) => r !== w.kill);
      const others = rng.sample(rewards, 3);
      if (!others) return null;
      return question({
        type: "mc",
        prompt: { key: "qKillReward", params: { weapon: w.name } },
        choices: [w.kill, ...others].map((r) => ({ id: String(r), label: `$${r}` })),
        answer: String(w.kill),
        explain: { key: "eKillReward", params: { weapon: w.name, n: w.kill } },
      });
    },
  },
  {
    id: "whichTeam",
    tiers: [2, 3],
    make(rng, { weapons }) {
      // Only weapons that are genuinely side-locked — "both" has no tension.
      const w = rng.pick(weapons.filter((x) => x.team !== "both"));
      if (!w) return null;
      return question({
        type: "mc",
        prompt: { key: "qWhichTeam", params: { weapon: w.name } },
        choices: [
          { id: "t", label: "teamT", term: true },
          { id: "ct", label: "teamCt", term: true },
          { id: "both", label: "teamBoth", term: true },
        ],
        answer: w.team,
        explain: { key: "eWhichTeam", params: { weapon: w.name, team: TEAM_LABEL[w.team] } },
      });
    },
  },
  {
    id: "cheapestOf",
    tiers: [2, 3],
    make(rng, { weapons }) {
      const four = rng.sample(weapons, 4);
      if (!four) return null;
      const cheapest = four.reduce((a, b) => (b.price < a.price ? b : a));
      if (four.filter((w) => w.price === cheapest.price).length > 1) return null;
      return question({
        type: "mc",
        prompt: { key: "qCheapestOf" },
        choices: four.map((w) => ({ id: w.id, label: w.name })),
        answer: cheapest.id,
        explain: { key: "eCheapestOf", params: { weapon: cheapest.name, n: cheapest.price } },
      });
    },
  },

  // ---------------------------------------------------------------- tier 3
  {
    id: "roundReward",
    tiers: [3, 4],
    make(rng, { economy }) {
      const cases = [
        { key: "winElimination", value: economy.winElimination },
        { key: "winBombDetonated", value: economy.winBombDetonated },
        { key: "winBombDefused", value: economy.winBombDefused },
        { key: "plantBonusTeam", value: economy.plantBonusTeam },
        { key: "defuseBonusPlayer", value: economy.defuseBonusPlayer },
      ];
      const c = rng.pick(cases);
      const pool = [...new Set([3250, 3500, 800, 300, 1400, 2000, 900])].filter((v) => v !== c.value);
      const others = rng.sample(pool, 3);
      if (!others) return null;
      return question({
        type: "mc",
        prompt: { key: `qEco_${c.key}` },
        choices: [c.value, ...others].map((v) => ({ id: String(v), label: `$${v}` })),
        answer: String(c.value),
      });
    },
  },
  {
    id: "callout",
    tiers: [3, 4],
    make(rng, { maps }) {
      const map = rng.pick(maps);
      const callout = rng.pick(map.callouts);
      // A callout shared with another map would have two right answers.
      if (maps.some((m) => m.id !== map.id && m.callouts.includes(callout))) return null;
      const others = rng.sample(maps.filter((m) => m.id !== map.id), 3);
      if (!others) return null;
      return question({
        type: "mc",
        prompt: { key: "qCallout", params: { callout } },
        choices: [map, ...others].map((m) => ({ id: m.id, label: m.name })),
        answer: map.id,
      });
    },
  },
  {
    id: "fullBuyCost",
    tiers: [3, 4],
    make(rng, { weapons, gear, utility }) {
      // Rifle + armour&helmet + two nades: the sum every player does in their head.
      const rifle = rng.pick(weapons.filter((w) => w.category === "Rifles"));
      const helmet = gear.find((g) => g.id === "kevlarhelmet");
      const nadeA = utility.find((u) => u.id === "smoke");
      const nadeB = utility.find((u) => u.id === "flashbang");
      if (!rifle || !helmet || !nadeA || !nadeB) return null;
      const total = rifle.price + helmet.price + nadeA.price + nadeB.price;
      const others = rng.sample([...new Set([total + 200, total - 200, total + 450, total - 350, total + 700])], 3);
      if (!others) return null;
      return question({
        type: "mc",
        prompt: { key: "qFullBuy", params: { weapon: rifle.name } },
        choices: [total, ...others].map((v) => ({ id: String(v), label: `$${v}` })),
        answer: String(total),
        explain: {
          key: "eFullBuy",
          params: { weapon: rifle.name, a: rifle.price, b: helmet.price, c: nadeA.price + nadeB.price, n: total },
        },
      });
    },
  },

  // ---------------------------------------------------------------- tier 4
  {
    id: "lossLadder",
    tiers: [4],
    make(rng, { economy }) {
      const idx = rng.int(economy.lossBonusLadder.length);
      const value = economy.lossBonusLadder[idx];
      const others = rng.sample(economy.lossBonusLadder.filter((v) => v !== value), 3);
      if (!others) return null;
      return question({
        type: "mc",
        prompt: { key: "qLossLadder", params: { n: idx + 1 } },
        choices: [value, ...others].map((v) => ({ id: String(v), label: `$${v}` })),
        answer: String(value),
        explain: { key: "eLossLadder", params: { ladder: economy.lossBonusLadder.map((v) => `$${v}`).join(" → ") } },
      });
    },
  },
  {
    id: "magSize",
    tiers: [4],
    make(rng, { weapons }) {
      const w = rng.pick(weapons);
      const mags = [...new Set(weapons.map((x) => x.mag))].filter((m) => m !== w.mag);
      const others = rng.sample(mags, 3);
      if (!others) return null;
      return question({
        type: "mc",
        prompt: { key: "qMagSize", params: { weapon: w.name } },
        choices: [w.mag, ...others].map((m) => ({ id: String(m), label: String(m) })),
        answer: String(w.mag),
      });
    },
  },
  {
    id: "priciestOf",
    tiers: [3, 4],
    make(rng, { weapons }) {
      const four = rng.sample(weapons, 4);
      if (!four) return null;
      const best = four.reduce((a, b) => (b.price > a.price ? b : a));
      if (four.filter((w) => w.price === best.price).length > 1) return null;
      return question({
        type: "mc",
        prompt: { key: "qPriciestOf" },
        choices: four.map((w) => ({ id: w.id, label: w.name })),
        answer: best.id,
        explain: { key: "ePriciestOf", params: { weapon: best.name, n: best.price } },
      });
    },
  },
  {
    id: "weaponDamage",
    tiers: [4],
    make(rng, { weapons }) {
      const withDmg = weapons.filter((w) => w.damage);
      const w = rng.pick(withDmg);
      if (!w) return null;
      const others = rng.sample([...new Set(withDmg.map((x) => x.damage).filter((d) => d !== w.damage))], 3);
      if (!others) return null;
      return question({
        type: "mc",
        prompt: { key: "qWeaponDamage", params: { weapon: w.name } },
        choices: [w.damage, ...others].map((d) => ({ id: String(d), label: String(d) })),
        answer: String(w.damage),
      });
    },
  },
];

module.exports = { GENERATORS, TEAM_LABEL };
