import requests
import json
import re
from bs4 import BeautifulSoup
import os

def get_agents():
    url = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/agents.json"
    response = requests.get(url)
    return response.json()

def get_faction_for_agent(agent_name):
    name_lower = agent_name.lower()
    
    if "sas" in name_lower: return "SAS"
    if "seal" in name_lower: return "SEAL_Team_6"
    if "fbi" in name_lower: return "FBI"
    if "swat" in name_lower: return "SWAT"
    if "gign" in name_lower: return "GIGN"
    if "sabre" in name_lower: return "Sabre"
    if "phoenix" in name_lower: return "Phoenix_Connexion"
    if "elite crew" in name_lower or "leet" in name_lower: return "Elite_Crew"
    if "professionals" in name_lower: return "Professionals"
    if "balkan" in name_lower: return "Balkan"
    
    return "SAS" 

def scrape_faction_voice_lines(faction):
    url = f"https://counterstrike.fandom.com/api.php?action=parse&page={faction}/Quotes&format=json"
    res = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
    if res.status_code != 200:
        return {}
    
    data = res.json()
    if 'parse' not in data or 'text' not in data['parse']:
        return {}
        
    html_content = data['parse']['text']['*']
    soup = BeautifulSoup(html_content, 'html.parser')
    radio_commands = {}
    
    for audio_tag in soup.find_all('audio'):
        src_tag = audio_tag.find('source')
        if not src_tag: continue
        
        audio_url = src_tag.get('src')
        if not audio_url: continue
        
        parent_li = audio_tag.find_parent('li')
        if parent_li:
            text = parent_li.get_text(strip=True)
            text = re.sub(r'Play\s*', '', text)
            
            if 2 < len(text) < 100:
                radio_commands[text] = audio_url.split('/revision/')[0]
                
    return radio_commands

def build_mapping():
    agents = get_agents()
    factions_cache = {}
    mapping = {}
    
    for agent in agents:
        agent_id = agent.get('id')
        agent_name = agent.get('name')
        
        faction = get_faction_for_agent(agent_name)
        
        if faction not in factions_cache:
            print(f"Scraping voice lines for {faction}...")
            factions_cache[faction] = scrape_faction_voice_lines(faction)
            
        mapping[agent_id] = {
            "name": agent_name,
            "faction": faction,
            "radio_commands": factions_cache[faction]
        }
        
    out_dir = "/home/evan/projects/Garden-website/data"
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "agent_voices.json")
    
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(mapping, f, indent=4)
        
    print(f"Success! Saved mapping to {out_path}")

if __name__ == "__main__":
    build_mapping()
