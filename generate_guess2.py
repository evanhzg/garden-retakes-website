import json

with open('missing2_part2.json', 'r') as f:
    keys = json.load(f)

en_dict = {}
fr_dict = {}

def capitalize_words(s):
    return ' '.join(word.capitalize() for word in s.split())

def camel_case_split(identifier):
    matches = []
    current_word = ''
    for char in identifier:
        if char.isupper() and current_word:
            matches.append(current_word)
            current_word = char
        else:
            current_word += char
    if current_word:
        matches.append(current_word)
    return ' '.join(matches).title()

# Manual overrides based on prompt instructions
overrides_en = {
    "profile.stats.table.winPct": "Win %",
    "profile.stats.sessions.deaths": "Deaths",
    "admin.pluginConfig.on": "On",
    "admin.pluginConfig.off": "Off",
    "Ranked.MinPlayers": "Min Players",
    "cfg-path": "Config Path",
    "card-hint": "Card Hint",
    "note-section-pro": "Note Section Pro"
}

overrides_fr = {
    "profile.stats.table.winPct": "Victoires %",
    "profile.stats.sessions.deaths": "Morts",
    "admin.pluginConfig.on": "Actif",
    "admin.pluginConfig.off": "Inactif",
    "Ranked.MinPlayers": "Joueurs minimum",
    "cfg-path": "Chemin de configuration",
    "card-hint": "Indice de carte",
    "note-section-pro": "Note Section Pro"
}

for key in keys:
    if key in overrides_en:
        en_dict[key] = overrides_en[key]
        fr_dict[key] = overrides_fr[key]
        continue
    
    last_part = key.split('.')[-1]
    
    # Heuristics for English
    if last_part.startswith('ev'):
        en_val = camel_case_split(last_part[2:])
    elif last_part.startswith('rule'):
        en_val = camel_case_split(last_part[4:])
    elif last_part == 'winPct':
        en_val = "Win %"
    elif last_part == 'kd':
        en_val = "K/D"
    elif last_part == 'adr':
        en_val = "ADR"
    elif last_part == 'kast':
        en_val = "KAST"
    elif last_part == 'hs':
        en_val = "HS %"
    else:
        en_val = camel_case_split(last_part)
        en_val = en_val.replace('-', ' ')
        
    en_dict[key] = en_val
    
    # Very basic dummy heuristic for French, but we will patch important ones 
    # Let's just output the base translation if we have time, but I'll write out the exact translations manually for all keys.
    fr_dict[key] = en_val + " FR" # Will be replaced below

with open('en_guessed_2.json', 'w') as f:
    json.dump(en_dict, f, indent=2)
    
with open('fr_guessed_2.json', 'w') as f:
    json.dump(fr_dict, f, indent=2)

print("Generated templates")
