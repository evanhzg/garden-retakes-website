// BUILD PATH — the LoL question bank.
//
// Every question is derived from the committed Data Dragon / wiki datasets, so
// nothing here is an opinion: build paths, costs and stats are facts of the
// live patch, and the "which item for this champion" questions are decided by
// the champion's own damage type rather than by a tier list.
//
// Tiers: 1 Iron (recognition) → 2 Bronze/Silver (build paths) → 3 Gold
// (applied) → 4 Challenger (exact numbers).

const { question } = require("./quizEngine");

// Stat keys Data Dragon uses, with the label the client shows.
const STAT_LABELS = {
  FlatMagicDamageMod: "statAp",
  FlatPhysicalDamageMod: "statAd",
  FlatArmorMod: "statArmor",
  FlatSpellBlockMod: "statMr",
  FlatHPPoolMod: "statHp",
  FlatMovementSpeedMod: "statMs",
  PercentAttackSpeedMod: "statAs",
  FlatCritChanceMod: "statCrit",
};

const AP_TAG = "SpellDamage";
const AD_TAG = "Damage";

const isCompleted = (it) => (it.into || []).length === 0 && it.gold.total >= 1600;
const isComponent = (it) => (it.into || []).length > 0 && it.gold.total > 0;
const nameOf = (it, lang) => (lang === "fr" ? it.nameFr || it.name : it.name);

/**
 * Items that genuinely scale a damage type.
 *
 * Tag alone is not enough: Ardent Censer carries the SpellDamage tag but grants
 * no Ability Power, so tag-matching alone once offered it as "the item for
 * Kai'Sa". Requiring a real amount of the stat keeps these questions factual.
 */
function itemsForDamageType(items, damageType) {
  const wantStat = damageType === "Magic" ? "FlatMagicDamageMod" : "FlatPhysicalDamageMod";
  const avoidStat = damageType === "Magic" ? "FlatPhysicalDamageMod" : "FlatMagicDamageMod";
  const floor = damageType === "Magic" ? 40 : 25;
  return items.filter(
    (it) => isCompleted(it) && Number(it.stats[wantStat] || 0) >= floor && !Number(it.stats[avoidStat] || 0)
  );
}

const GENERATORS = [
  // ---------------------------------------------------------------- tier 1
  {
    id: "itemCost",
    tiers: [1, 2],
    make(rng, { items, lang }) {
      const pool = items.filter((it) => it.gold.total >= 800);
      const target = rng.pick(pool);
      if (!target) return null;
      // Distractors far enough apart that the answer isn't a coin flip, and
      // distinct from each other — two identical price tags read as a bug.
      const prices = [...new Set(
        pool
          .filter((it) => Math.abs(it.gold.total - target.gold.total) > 250)
          .map((it) => it.gold.total)
      )];
      const others = rng.sample(prices, 3);
      if (!others) return null;
      return question({
        type: "mc",
        prompt: { key: "qItemCost", params: { item: nameOf(target, lang) } },
        image: target.image,
        choices: [target.gold.total, ...others].map((g) => ({ id: String(g), label: `${g} g` })),
        answer: String(target.gold.total),
        explain: { key: "eItemCost", params: { item: nameOf(target, lang), n: target.gold.total } },
      });
    },
  },
  {
    id: "itemCostInput",
    tiers: [1, 2, 3],
    make(rng, { items, lang }) {
      const pool = items.filter((it) => it.gold.total >= 800);
      const target = rng.pick(pool);
      if (!target) return null;
      return question({
        type: "input",
        prompt: { key: "qItemCostInput", params: { item: nameOf(target, lang) } },
        image: target.image,
        answer: String(target.gold.total),
        accept: [`${target.gold.total}g`, `${target.gold.total} g`],
        explain: { key: "eItemCost", params: { item: nameOf(target, lang), n: target.gold.total } },
      });
    },
  },
  {
    id: "champRegion",
    tiers: [1, 2],
    make(rng, { champions, lang }) {
      const c = rng.pick(champions);
      const region = c.regions[0];
      const others = rng.sample([...new Set(champions.flatMap((x) => x.regions))].filter((r) => r !== region), 3);
      if (!others) return null;
      return question({
        type: "mc",
        prompt: { key: "qChampRegion", params: { champ: lang === "fr" ? c.nameFr : c.name } },
        champion: c.id,
        choices: [region, ...others].map((r) => ({ id: r, label: r, term: true })),
        answer: region,
      });
    },
  },
  {
    id: "champClass",
    tiers: [1, 2],
    make(rng, { champions, lang }) {
      const c = rng.pick(champions);
      const cls = c.classes[0];
      const others = rng.sample([...new Set(champions.flatMap((x) => x.classes))].filter((k) => !c.classes.includes(k)), 3);
      if (!cls || !others) return null;
      return question({
        type: "mc",
        prompt: { key: "qChampClass", params: { champ: lang === "fr" ? c.nameFr : c.name } },
        champion: c.id,
        choices: [cls, ...others].map((k) => ({ id: k, label: k, term: true })),
        answer: cls,
      });
    },
  },
  {
    id: "topPickedChampion",
    tiers: [1, 2, 3],
    make(rng, { meta, champions, lang }) {
      if (!meta || !meta.topPicks || meta.topPicks.length < 5) return null;
      // We have champion names in meta.topPicks, need to map to id.
      const findChamp = (name) => champions.find(c => c.name.toLowerCase() === name.toLowerCase() || c.id.toLowerCase() === name.toLowerCase());
      const target = findChamp(meta.topPicks[0]);
      if (!target) return null;
      
      const othersRaw = rng.sample(meta.topPicks.slice(1), 3);
      if (!othersRaw) return null;
      const others = othersRaw.map(findChamp).filter(Boolean);
      if (others.length < 3) return null;

      return question({
        type: "mc",
        prompt: { key: "qTopPicked" },
        choices: [target, ...others].map(c => ({ id: c.id, label: lang === "fr" ? c.nameFr : c.name, champion: c.id })),
        answer: target.id,
      });
    },
  },

  // ---------------------------------------------------------------- tier 2
  {
    id: "buildsFrom",
    tiers: [2, 3],
    make(rng, { items, byId, lang }) {
      const finished = items.filter((it) => (it.from || []).length >= 2 && isCompleted(it));
      const target = rng.pick(finished);
      if (!target) return null;
      const component = byId.get(rng.pick(target.from));
      if (!component) return null;
      const others = rng.sample(
        items.filter((it) => isComponent(it) && !target.from.includes(it.id)),
        3
      );
      if (!others) return null;
      return question({
        type: "mc",
        prompt: { key: "qBuildsFrom", params: { item: nameOf(target, lang) } },
        image: target.image,
        choices: [component, ...others].map((it) => ({ id: it.id, label: nameOf(it, lang), image: it.image })),
        answer: component.id,
        explain: {
          key: "eBuildsFrom",
          params: {
            item: nameOf(target, lang),
            parts: target.from.map((f) => (byId.get(f) ? nameOf(byId.get(f), lang) : "?")).join(" + "),
          },
        },
      });
    },
  },
  {
    id: "buildsInto",
    tiers: [2, 3],
    make(rng, { items, byId, lang }) {
      const comps = items.filter((it) => (it.into || []).length >= 1 && it.gold.total <= 1300);
      const component = rng.pick(comps);
      if (!component) return null;
      const upgrade = byId.get(rng.pick(component.into));
      if (!upgrade) return null;
      const others = rng.sample(
        items.filter((it) => isCompleted(it) && !(component.into || []).includes(it.id)),
        3
      );
      if (!others) return null;
      return question({
        type: "mc",
        prompt: { key: "qBuildsInto", params: { item: nameOf(component, lang) } },
        image: component.image,
        choices: [upgrade, ...others].map((it) => ({ id: it.id, label: nameOf(it, lang), image: it.image })),
        answer: upgrade.id,
      });
    },
  },
  {
    id: "champPosition",
    tiers: [2, 3],
    make(rng, { champions, lang }) {
      const c = rng.pick(champions.filter((x) => x.positions.length === 1));
      if (!c) return null;
      const pos = c.positions[0];
      const others = rng.sample(["Top", "Jungle", "Middle", "Bottom", "Support"].filter((p) => p !== pos), 3);
      if (!others) return null;
      return question({
        type: "mc",
        prompt: { key: "qChampPosition", params: { champ: lang === "fr" ? c.nameFr : c.name } },
        champion: c.id,
        choices: [pos, ...others].map((p) => ({ id: p, label: p, term: true })),
        answer: pos,
      });
    },
  },

  // ---------------------------------------------------------------- tier 3
  {
    id: "itemForChampion",
    tiers: [3, 4],
    make(rng, { champions, items, lang }) {
      // Decided by the champion's own adaptive type and the item's actual
      // stats, so there is exactly one defensible answer — not a tier list.
      const c = rng.pick(champions.filter((x) => x.damageType === "Magic" || x.damageType === "Physical"));
      if (!c) return null;
      const good = itemsForDamageType(items, c.damageType);
      const bad = itemsForDamageType(items, c.damageType === "Magic" ? "Physical" : "Magic");
      const right = rng.pick(good);
      const wrong = rng.sample(bad, 3);
      if (!right || !wrong) return null;
      return question({
        type: "mc",
        prompt: { key: "qItemForChampion", params: { champ: lang === "fr" ? c.nameFr : c.name, type: c.damageType } },
        champion: c.id,
        choices: [right, ...wrong].map((it) => ({ id: it.id, label: nameOf(it, lang), image: it.image })),
        answer: right.id,
        explain: { key: "eItemForChampion", params: { champ: lang === "fr" ? c.nameFr : c.name, type: c.damageType, item: nameOf(right, lang) } },
      });
    },
  },
  {
    id: "whoseAbility",
    tiers: [3, 4],
    make(rng, { champions, lang }) {
      const c = rng.pick(champions.filter((x) => x.skills.length >= 4));
      if (!c) return null;
      const ability = rng.pick(c.skills.slice(1)); // skip the passive, often generic
      const others = rng.sample(champions.filter((x) => x.id !== c.id), 3);
      if (!ability || !others) return null;
      return question({
        type: "mc",
        prompt: { key: "qWhoseAbility", params: { ability } },
        choices: [c, ...others].map((x) => ({
          id: x.id,
          label: lang === "fr" ? x.nameFr : x.name,
          champion: x.id,
        })),
        answer: c.id,
      });
    },
  },
  {
    id: "highestStat",
    tiers: [3, 4],
    make(rng, { items, lang }) {
      const statKey = rng.pick(["FlatMagicDamageMod", "FlatPhysicalDamageMod", "FlatArmorMod", "FlatHPPoolMod"]);
      const withStat = items.filter((it) => isCompleted(it) && Number(it.stats[statKey]) > 0);
      const four = rng.sample(withStat, 4);
      if (!four) return null;
      const best = four.reduce((a, b) => (Number(b.stats[statKey]) > Number(a.stats[statKey]) ? b : a));
      // A tie would make two answers correct.
      if (four.filter((it) => Number(it.stats[statKey]) === Number(best.stats[statKey])).length > 1) return null;
      return question({
        type: "mc",
        prompt: { key: "qHighestStat", params: { stat: STAT_LABELS[statKey] } },
        statLabel: STAT_LABELS[statKey],
        choices: four.map((it) => ({ id: it.id, label: nameOf(it, lang), image: it.image })),
        answer: best.id,
        explain: { key: "eHighestStat", params: { item: nameOf(best, lang), n: Number(best.stats[statKey]) } },
      });
    },
  },

  // ---------------------------------------------------------------- tier 4
  {
    id: "combineCost",
    tiers: [4],
    make(rng, { items, lang }) {
      const target = rng.pick(items.filter((it) => (it.from || []).length >= 2 && it.gold.base >= 200));
      if (!target) return null;
      // De-duplicated: two identical price tags would read as a broken question.
      const candidates = [...new Set(
        [target.gold.base + 150, target.gold.base - 150, target.gold.base + 400, target.gold.base - 300, target.gold.base + 250]
          .filter((n) => n > 0 && n !== target.gold.base)
      )];
      const others = rng.sample(candidates, 3);
      if (!others) return null;
      return question({
        type: "mc",
        prompt: { key: "qCombineCost", params: { item: nameOf(target, lang) } },
        image: target.image,
        choices: [target.gold.base, ...others].map((n) => ({ id: String(n), label: `${n} g` })),
        answer: String(target.gold.base),
        explain: { key: "eCombineCost", params: { item: nameOf(target, lang), n: target.gold.base, total: target.gold.total } },
      });
    },
  },
  {
    id: "champReleaseYear",
    tiers: [4],
    make(rng, { champions, lang }) {
      const c = rng.pick(champions);
      if (!c.releaseYear) return null;
      const candidates = [...new Set(
        [c.releaseYear - 1, c.releaseYear + 1, c.releaseYear - 3, c.releaseYear + 2, c.releaseYear - 5, c.releaseYear + 4]
          .filter((y) => y >= 2009 && y <= new Date().getUTCFullYear() && y !== c.releaseYear)
      )];
      const others = rng.sample(candidates, 3);
      if (!others) return null;
      return question({
        type: "mc",
        prompt: { key: "qChampYear", params: { champ: lang === "fr" ? c.nameFr : c.name } },
        champion: c.id,
        choices: [c.releaseYear, ...others].map((y) => ({ id: String(y), label: String(y) })),
        answer: String(c.releaseYear),
      });
    },
  },
  {
    id: "champReleaseYearInput",
    tiers: [3, 4],
    make(rng, { champions, lang }) {
      const c = rng.pick(champions);
      if (!c.releaseYear) return null;
      return question({
        type: "input",
        prompt: { key: "qChampYearInput", params: { champ: lang === "fr" ? c.nameFr : c.name } },
        champion: c.id,
        answer: String(c.releaseYear),
      });
    },
  },
  {
    id: "mostExpensive",
    tiers: [3, 4],
    make(rng, { items, lang }) {
      const four = rng.sample(items.filter((it) => it.gold.total >= 900), 4);
      if (!four) return null;
      const best = four.reduce((a, b) => (b.gold.total > a.gold.total ? b : a));
      if (four.filter((it) => it.gold.total === best.gold.total).length > 1) return null;
      return question({
        type: "mc",
        prompt: { key: "qMostExpensive" },
        choices: four.map((it) => ({ id: it.id, label: nameOf(it, lang), image: it.image })),
        answer: best.id,
        explain: { key: "eMostExpensive", params: { item: nameOf(best, lang), n: best.gold.total } },
      });
    },
  },
];

module.exports = { GENERATORS, STAT_LABELS };
