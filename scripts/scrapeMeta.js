const fs = require('fs');
const path = require('path');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const CS2_META_PATH = path.join(__dirname, '../data/cs2Meta.json');
const LOL_META_PATH = path.join(__dirname, '../data/lolMeta.json');

async function scrapeCS2Meta() {
  try {
    const res = await fetch('https://api.csapi.de/rankings');
    if (res.ok) {
      const data = await res.json();
      const rankings = Array.isArray(data) ? data : (data.rankings || []);
      const topTeams = rankings.slice(0, 10).map(t => t.name || (t.team && t.team.name));
      fs.writeFileSync(CS2_META_PATH, JSON.stringify({ topTeams, updatedAt: Date.now() }, null, 2));
      console.log('Successfully updated CS2 meta cache.');
    } else {
      console.error('CS2 meta non-ok:', res.status, await res.text());
      const fallbackTeams = ["FaZe", "NAVI", "Vitality", "MOUZ", "G2", "Spirit", "Virtus.pro", "Astralis", "Complexity", "HEROIC"];
      fs.writeFileSync(CS2_META_PATH, JSON.stringify({ topTeams: fallbackTeams, updatedAt: Date.now(), isFallback: true }, null, 2));
      console.log('Wrote fallback CS2 meta cache due to non-ok response.');
    }
  } catch (err) {
    console.error('Failed to scrape CS2 meta:', err);
    const fallbackTeams = ["FaZe", "NAVI", "Vitality", "MOUZ", "G2", "Spirit", "Virtus.pro", "Astralis", "Complexity", "HEROIC"];
    fs.writeFileSync(CS2_META_PATH, JSON.stringify({ topTeams: fallbackTeams, updatedAt: Date.now(), isFallback: true }, null, 2));
    console.log('Wrote fallback CS2 meta cache due to error.');
  }
}

async function scrapeLoLMeta() {
  try {
    const url = new URL('https://lol.fandom.com/api.php');
    url.search = new URLSearchParams({
      action: 'cargoquery',
      format: 'json',
      tables: 'ScoreboardGames',
      fields: 'Tournament, DateTime_UTC, Team1, Team2, Winner, Team1Picks, Team2Picks, Team1Bans, Team2Bans',
      where: 'DateTime_UTC > "2024-01-01"',
      order_by: 'DateTime_UTC DESC',
      limit: '50'
    });
    
    const res = await fetch(url, { headers: { 'User-Agent': 'GardenMetaFetcher/1.0 (evan2@example.com)' } });
    if (res.ok) {
      const data = await res.json();
      
      if (!data || !data.cargoquery) {
        console.error('No cargoquery in response:', data);
        // Fallback to dummy data to avoid breaking the game when rate limited
        const fallbackPicks = ["K'Sante", "Vi", "Azir", "Varus", "Rell", "Aatrox", "Sejuani", "Orianna", "Kalista", "Nautilus"];
        const fallbackBans = ["Rumble", "Ashe", "Senna", "Lucian", "Neeko", "Renata Glasc", "Maokai", "Jax", "Poppy", "Tristana"];
        fs.writeFileSync(LOL_META_PATH, JSON.stringify({ topPicks: fallbackPicks, topBans: fallbackBans, updatedAt: Date.now(), isFallback: true }, null, 2));
        console.log('Wrote fallback LoL meta cache due to rate limit.');
        return;
      }

      const picks = {};
      const bans = {};
      
      data.cargoquery.forEach(g => {
        const match = g.title;
        if (match.Team1Picks) match.Team1Picks.split(',').forEach(p => { const k = p.trim(); picks[k] = (picks[k] || 0) + 1; });
        if (match.Team2Picks) match.Team2Picks.split(',').forEach(p => { const k = p.trim(); picks[k] = (picks[k] || 0) + 1; });
        if (match.Team1Bans) match.Team1Bans.split(',').forEach(p => { const k = p.trim(); bans[k] = (bans[k] || 0) + 1; });
        if (match.Team2Bans) match.Team2Bans.split(',').forEach(p => { const k = p.trim(); bans[k] = (bans[k] || 0) + 1; });
      });

      const topPicks = Object.entries(picks).sort((a,b) => b[1]-a[1]).slice(0, 10).map(x => x[0]);
      const topBans = Object.entries(bans).sort((a,b) => b[1]-a[1]).slice(0, 10).map(x => x[0]);
      
      fs.writeFileSync(LOL_META_PATH, JSON.stringify({ topPicks, topBans, updatedAt: Date.now() }, null, 2));
      console.log('Successfully updated LoL meta cache.');
    }
  } catch (err) {
    console.error('Failed to scrape LoL meta:', err.message);
    const fallbackPicks = ["K'Sante", "Vi", "Azir", "Varus", "Rell", "Aatrox", "Sejuani", "Orianna", "Kalista", "Nautilus"];
    const fallbackBans = ["Rumble", "Ashe", "Senna", "Lucian", "Neeko", "Renata Glasc", "Maokai", "Jax", "Poppy", "Tristana"];
    fs.writeFileSync(LOL_META_PATH, JSON.stringify({ topPicks: fallbackPicks, topBans: fallbackBans, updatedAt: Date.now(), isFallback: true }, null, 2));
    console.log('Wrote fallback LoL meta cache due to error.');
  }
}

async function scrapeAll() {
  await scrapeCS2Meta();
  await scrapeLoLMeta();
}

if (require.main === module) {
  scrapeAll();
}

module.exports = { scrapeAll, scrapeCS2Meta, scrapeLoLMeta };
