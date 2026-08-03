const fs = require('fs');
const https = require('https');

async function translateText(text) {
  return new Promise((resolve, reject) => {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fr&dt=t&q=${encodeURIComponent(text)}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed[0].map(x => x[0]).join(''));
        } catch (e) {
          resolve(text);
        }
      });
    }).on('error', (err) => {
      resolve(text);
    });
  });
}

async function run() {
  console.log("Starting translation...");
  const missingEn = JSON.parse(fs.readFileSync('missing_en.json'));
  const origEn = JSON.parse(fs.readFileSync('locales/en.json'));
  const origFr = JSON.parse(fs.readFileSync('locales/fr.json'));

  // Hardcoded French corrections
  const frCorrections = {
    "admin.pluginConfig.on": "Actif",
    "admin.pluginConfig.off": "Inactif",
    "Ranked.MinPlayers": "Joueurs minimum",
    "profile.stats.sessions.deaths": "Morts",
    "profile.stats.table.winPct": "Victoires %"
  };

  const missingFr = {};
  const entries = Object.entries(missingEn);
  let i = 0;
  
  for (const [k, v] of entries) {
    if (frCorrections[k]) {
      missingFr[k] = frCorrections[k];
    } else {
      missingFr[k] = await translateText(v);
      await new Promise(r => setTimeout(r, 80)); // Rate limit 80ms
    }
    i++;
    if (i % 50 === 0) console.log(`Translated ${i}/${entries.length}`);
  }

  const combinedEn = { ...origEn, ...missingEn };
  const combinedFr = { ...origFr, ...missingFr };

  fs.writeFileSync('locales/en.json', JSON.stringify(combinedEn, null, 2));
  fs.writeFileSync('locales/fr.json', JSON.stringify(combinedFr, null, 2));
  console.log("Done!");
}

run();
