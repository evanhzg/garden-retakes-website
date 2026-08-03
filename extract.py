import os
import re
import json

directories = [
    'components/feed',
    'components/stats',
    'components/home',
    'components/admin',
    'components/social',
    'app'
]

results = set()

def extract_from_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            
            # JSX Text: >Text<
            for match in re.findall(r'>([^<>{}]*[a-zA-Z][^<>{}]*)<', content):
                s = match.strip()
                if len(s) > 1 and not re.match(r'^[A-Z0-9_]+$', s): # ignore all caps/vars
                    results.add(s)
            
            # Attributes
            for attr in ['title', 'placeholder', 'aria-label', 'alt']:
                for match in re.findall(rf'{attr}="([^"]*[a-zA-Z][^"]*)"', content):
                    s = match.strip()
                    results.add(s)
                    
            # String literals returning texts in React (very basic heuristic)
            # looking for single/double quotes with text
            for match in re.findall(r'["\']([A-Z][a-z]+ [^"\']{2,})["\']', content):
                 s = match.strip()
                 results.add(s)
                 
    except Exception as e:
        pass

for d in directories:
    for root, _, files in os.walk(d):
        for file in files:
            if file.endswith(('.tsx', '.ts')):
                extract_from_file(os.path.join(root, file))

# Filter out obvious code/CSS
filtered = []
for s in results:
    s = s.strip()
    if len(s) < 3: continue
    if '{' in s or '}' in s: continue
    if s.startswith('http'): continue
    if s.endswith('.png') or s.endswith('.jpg'): continue
    if ' ' not in s and not s.istitle(): continue
    filtered.append(s)

filtered = sorted(filtered)
with open('extracted_strings.json', 'w') as f:
    json.dump(filtered, f, indent=2)

print(f"Extracted {len(filtered)} strings")
