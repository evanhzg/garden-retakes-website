const fs = require('fs');

const missing = JSON.parse(fs.readFileSync('missing2.json'));

const enDict = {};

// Hardcoded corrections from user:
const corrections = {
  "admin.pluginConfig.on": "On",
  "admin.pluginConfig.off": "Off",
  "Ranked.MinPlayers": "Min Players",
  "profile.stats.sessions.deaths": "Deaths",
  "profile.stats.table.winPct": "Win %",
  "profile.stats.table.rating": "Rating",
  "profile.stats.table.kd": "K/D",
  "profile.stats.table.adr": "ADR",
  "profile.stats.table.kast": "KAST",
  "profile.stats.table.map": "Map",
  "profile.stats.table.rounds": "Rounds",
  "profile.stats.form.roundWin": "Round Win",
  "profile.stats.form.rating": "Rating",
  "profile.season.allRoundsNote": "All rounds note",
};

for (const key of missing) {
  if (corrections[key]) {
    enDict[key] = corrections[key];
    continue;
  }
  
  // Guess based on last part of key
  let parts = key.split('.');
  let last = parts[parts.length - 1];
  
  // camelCase to Words
  let words = last.replace(/([A-Z])/g, ' $1').trim();
  words = words.charAt(0).toUpperCase() + words.slice(1);
  
  if (words.toLowerCase() === 'btn') words = 'Button';
  if (words.toLowerCase() === 'desc') words = 'Description';
  
  enDict[key] = words;
}

fs.writeFileSync('missing_en.json', JSON.stringify(enDict, null, 2));
console.log("Created missing_en.json with", Object.keys(enDict).length, "keys");
