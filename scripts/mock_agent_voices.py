import json
import os

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

radio_commands_list = [
    "Go Go Go",
    "Fall Back",
    "Stick Together",
    "Hold This Position",
    "Follow Me",
    "Affirmative",
    "Negative",
    "Cheer",
    "Compliment",
    "Thanks",
    "Enemy Spotted",
    "Need Backup",
    "Take the Point",
    "Sector Clear",
    "I'm in Position"
]

mapping = {}
for agent in agents:
    radio = {}
    for cmd in radio_commands_list:
        safe_cmd = cmd.lower().replace(' ', '_').replace("'", "")
        radio[cmd] = f"/audio/agents/{agent['faction'].lower()}_{safe_cmd}.ogg"
    
    mapping[agent['id']] = {
        "name": agent['name'],
        "faction": agent['faction'],
        "radio_commands": radio
    }

out_dir = "/home/evan/projects/Garden-website/data"
os.makedirs(out_dir, exist_ok=True)
with open(os.path.join(out_dir, "agent_voices.json"), "w") as f:
    json.dump(mapping, f, indent=4)
print("Mocked JSON created!")
