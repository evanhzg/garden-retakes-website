import json

def camel_to_spaces(s):
    res = []
    for c in s:
        if c.isupper() and res:
            res.append(' ')
        res.append(c)
    return "".join(res).title()

def parse_key(key):
    # Split by dot
    parts = key.split('.')
    last_part = parts[-1]
    
    # Handle underscores
    if '_' in last_part:
        words = last_part.split('_')
        return " ".join([w.title() for w in words])
    
    # Handle camel case
    return camel_to_spaces(last_part)

with open('missing2_part1.json', 'r') as f:
    keys = json.load(f)

en_dict = {}
fr_dict = {}

hardcoded_en = {
    "admin.pluginConfig.on": "On",
    "admin.pluginConfig.off": "Off",
    "Ranked.MinPlayers": "Min Players",
    "profile.stats.sessions.deaths": "Deaths",
    "profile.stats.table.winPct": "Win %",
    "profile.signInPrompt": "Sign In Prompt",
    "profile.signInButton": "Sign In",
    "settings.signInPrompt": "Sign In Prompt",
    "settings.signInButton": "Sign In",
    "admin.pluginConfig.btn.reload": "Reload",
    "admin.pluginConfig.btn.noChanges": "No Changes",
    "admin.pluginConfig.btn.reviewChanges": "Review Changes",
    "admin.pluginConfig.btn.cancel": "Cancel",
    "admin.pluginConfig.btn.saveOnly": "Save Only",
    "admin.pluginConfig.btn.saveApplyNow": "Save Apply Now",
    "admin.pluginConfig.btn.saving": "Saving",
    "admin.pluginConfig.btn.saveApply": "Save Apply",
    "google.notice.signin": "Sign In",
    "google.action.busy": "Busy",
    "discord.action.busy": "Busy",
    "admin.overview.error_loading": "Error Loading",
    "admin.overview.demos_waiting": "Demos Waiting"
}

hardcoded_fr = {
    "admin.pluginConfig.on": "Actif",
    "admin.pluginConfig.off": "Inactif",
    "Ranked.MinPlayers": "Joueurs minimum",
    "profile.stats.sessions.deaths": "Morts",
    "profile.stats.table.winPct": "Victoires %",
    "profile.signInButton": "Se connecter",
    "settings.signInButton": "Se connecter",
    "admin.pluginConfig.btn.reload": "Recharger",
    "admin.pluginConfig.btn.noChanges": "Aucun changement",
    "admin.pluginConfig.btn.reviewChanges": "Examiner les changements",
    "admin.pluginConfig.btn.cancel": "Annuler",
    "admin.pluginConfig.btn.saveOnly": "Sauvegarder uniquement",
    "admin.pluginConfig.btn.saveApplyNow": "Sauvegarder et appliquer maintenant",
    "admin.pluginConfig.btn.saving": "Sauvegarde en cours",
    "admin.pluginConfig.btn.saveApply": "Sauvegarder et appliquer",
    "google.notice.signin": "Se connecter",
    "google.action.busy": "Occupé",
    "discord.action.busy": "Occupé",
    "admin.overview.error_loading": "Erreur de chargement",
    "admin.overview.demos_waiting": "Démos en attente"
}

for k in keys:
    en_val = hardcoded_en.get(k)
    if en_val is None:
        en_val = parse_key(k)
    en_dict[k] = en_val
    
    fr_val = hardcoded_fr.get(k)
    if fr_val is None:
        # Simplistic translation based on English words
        # A bit tedious to map 314 items manually, I'll use a local mapping via LLM for the rest in python script... wait.
        pass

# I'll output en_guessed_1.json first, and I will write a simple dictionary in python.
with open('en_guessed_1.json', 'w') as f:
    json.dump(en_dict, f, indent=2)

