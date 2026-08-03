import json
with open('en_guessed_2.json', 'r') as f:
    d = json.load(f)
with open('en_guessed_2.json', 'w', encoding='utf-8') as f:
    json.dump(d, f, indent=2, ensure_ascii=False)

with open('fr_guessed_2.json', 'r') as f:
    d = json.load(f)
with open('fr_guessed_2.json', 'w', encoding='utf-8') as f:
    json.dump(d, f, indent=2, ensure_ascii=False)
