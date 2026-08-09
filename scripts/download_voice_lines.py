import os
import json
import requests
import urllib.request

factions = {
    "Professionals": "professional",
    "SEAL_Team_6": "seal",
    "SAS": "sas",
    "SWAT": "swat",
    "GIGN": "gign",
    "Sabre": "balkan", 
    "Phoenix_Connexion": "phoenix",
    "Elite_Crew": "leet",
    "Balkan": "balkan"
}

command_map = {
    "Go Go Go": ["radio.letsgo01.wav", "letsgo01.wav"],
    "Fall Back": ["radiobotfallback01.wav", "fallback01.wav"],
    "Stick Together": ["radiobotregroup01.wav", "sticktogether01.wav"],
    "Hold This Position": ["radiobothold01.wav", "holdposition01.wav", "inposition01.wav"],
    "Follow Me": ["radio.followme01.wav", "followme01.wav"],
    "Affirmative": ["affirmative01.wav", "agree01.wav"],
    "Negative": ["negative01.wav", "disagree01.wav"],
    "Cheer": ["peptalk01.wav", "cheer01.wav", "niceshot01.wav"],
    "Compliment": ["niceshot01.wav", "thanks01.wav"],
    "Thanks": ["thanks01.wav", "affirmative01.wav"],
    "Enemy Spotted": ["radio.enemyspotted01.wav", "enemyspotted01.wav"],
    "Need Backup": ["radio.needbackup01.wav", "needbackup01.wav", "help01.wav"],
    "Take the Point": ["coverme01.wav", "coveringfriend01.wav"],
    "Sector Clear": ["clearedarea01.wav", "bombsiteclear01.wav"],
    "I'm in Position": ["inposition01.wav", "reportingin01.wav", "waitinghere01.wav"]
}

out_dir = "/home/evan/projects/Garden-website/public/audio/agents"
os.makedirs(out_dir, exist_ok=True)

agents = [
    {"id": "agent-4613", "name": "Bloody Darryl The Strapped | The Professionals", "faction": "Professionals"},
    {"id": "agent-4619", "name": "'Blueberries' Buckshot | NSWC SEAL", "faction": "SEAL_Team_6"},
    {"id": "agent-4680", "name": "'Two Times' McCoy | TACP Cavalry", "faction": "SAS"},
    {"id": "agent-4711", "name": "Cmdr. Mae 'Dead Cold' Jamison | SWAT", "faction": "SWAT"},
    {"id": "agent-4712", "name": "1st Lieutenant Farlow | SWAT", "faction": "SWAT"},
    {"id": "agent-4713", "name": "John 'Van Healen' Kask | SWAT", "faction": "SWAT"},
    {"id": "agent-4714", "name": "Bio-Haz Specialist | SWAT", "faction": "SWAT"},
    {"id": "agent-4715", "name": "Sergeant Bombson | SWAT", "faction": "SWAT"},
    {"id": "agent-4716", "name": "Chem-Haz Specialist | SWAT", "faction": "SWAT"},
    {"id": "agent-4718", "name": "Sir Bloody Miami Darryl | The Professionals", "faction": "Professionals"},
]

mapping = {}

base_url = "https://raw.githubusercontent.com/sourcesounds/csgo/master/sound/player/vo/{faction}/{file}"

for agent in agents:
    faction_key = agent['faction']
    gh_faction = factions.get(faction_key, "sas")
    
    radio = {}
    
    for cmd, file_options in command_map.items():
        # try to download the first one that works
        success = False
        safe_cmd = cmd.lower().replace(' ', '_').replace("'", "")
        local_filename = f"{faction_key.lower()}_{safe_cmd}.wav"
        local_path = os.path.join(out_dir, local_filename)
        
        # If already downloaded, skip
        if os.path.exists(local_path):
            radio[cmd] = f"/audio/agents/{local_filename}"
            continue
            
        for option in file_options:
            url = base_url.format(faction=gh_faction, file=option)
            res = requests.get(url, stream=True)
            if res.status_code == 200:
                with open(local_path, "wb") as f:
                    for chunk in res.iter_content(chunk_size=1024):
                        if chunk: f.write(chunk)
                radio[cmd] = f"/audio/agents/{local_filename}"
                print(f"Downloaded {local_filename}")
                success = True
                break
                
        if not success:
            print(f"Failed to find {cmd} for {faction_key}")
            
    mapping[agent['id']] = {
        "name": agent['name'],
        "faction": agent['faction'],
        "radio_commands": radio
    }

data_dir = "/home/evan/projects/Garden-website/data"
os.makedirs(data_dir, exist_ok=True)
with open(os.path.join(data_dir, "agent_voices.json"), "w") as f:
    json.dump(mapping, f, indent=4)
    
print("Done scraping actual audio files from GitHub!")
