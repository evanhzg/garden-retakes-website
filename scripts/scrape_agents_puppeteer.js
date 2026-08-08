const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cheerio = require('cheerio');
const fs = require('fs');

puppeteer.use(StealthPlugin());

const agentsUrl = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/agents.json";

function getFaction(name) {
    const l = name.toLowerCase();
    if (l.includes('sas')) return 'SAS';
    if (l.includes('seal')) return 'SEAL_Team_6';
    if (l.includes('fbi')) return 'FBI';
    if (l.includes('swat')) return 'SWAT';
    if (l.includes('gign')) return 'GIGN';
    if (l.includes('sabre')) return 'Sabre';
    if (l.includes('phoenix')) return 'Phoenix_Connexion';
    if (l.includes('elite crew') || l.includes('leet')) return 'Elite_Crew';
    if (l.includes('professionals')) return 'Professionals';
    if (l.includes('balkan')) return 'Balkan';
    if (l.includes('ksk')) return 'KSK';
    return 'SAS';
}

(async () => {
    console.log("Fetching agents...");
    const req = await fetch(agentsUrl);
    const agents = await req.json();

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    const factions = {};
    const mapping = {};

    for (const agent of agents) {
        const faction = getFaction(agent.name);
        if (!factions[faction]) {
            console.log("Scraping " + faction + "...");
            await page.goto(`https://counterstrike.fandom.com/wiki/${faction}/Quotes`, { waitUntil: 'networkidle2' });
            const html = await page.content();
            const $ = cheerio.load(html);
            
            const radio = {};
            $('audio').each((i, el) => {
                const src = $(el).find('source').attr('src');
                if (!src) return;
                
                const text = $(el).parent().text().replace(/Play/g, '').trim();
                if (text.length > 2 && text.length < 100) {
                    radio[text] = src.split('/revision/')[0];
                }
            });
            factions[faction] = radio;
            console.log(`Found ${Object.keys(radio).length} quotes for ${faction}`);
        }
        
        mapping[agent.id] = {
            name: agent.name,
            faction: faction,
            radio_commands: factions[faction]
        };
    }

    await browser.close();
    
    fs.writeFileSync('../data/agent_voices.json', JSON.stringify(mapping, null, 2));
    console.log("Done!");
})();
