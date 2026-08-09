import urllib.request
import re
import json

url = "https://raw.githubusercontent.com/SteamDatabase/GameTracking-CS2/master/game/csgo/scripts/items/items_game.txt"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req) as response:
    content = response.read().decode('utf-8')

# A very hacky items_game.txt parser to extract agent vo_prefix
# Agents are in the "items" block. We'll just regex search for "name" "customplayer_..." and near it "vo_prefix".
# It's better to find blocks.

agents = {}
import vdf # We don't have vdf installed, let's use a simple state machine

lines = content.splitlines()
in_items = False
current_item = None
current_name = None
current_vo = None

# We can just extract it with regex since VDF parsing in python without library is tedious.
# Actually, let's use regex to find all items: 
matches = re.finditer(r'"(\d+)"\s*\{[^{}]*"name"\s*"([^"]+)"[^{}]*(?:"vo_prefix"\s*"([^"]+)"[^{}]*)?\}', content, re.MULTILINE | re.DOTALL)
# This regex is too simple and might break with nested objects. 
# Better to do a line-by-line block parser.

block_level = 0
in_items_block = False
item_id = None
item_data = {}

for line in lines:
    line = line.strip()
    if line.startswith('//'): continue
    
    if block_level == 0 and line == '"items"':
        in_items_block = True
        continue
        
    if in_items_block and block_level == 0 and line == '{':
        block_level += 1
        continue
        
    if in_items_block and block_level == 1:
        if line == '}':
            in_items_block = False
            continue
        m = re.match(r'"(\d+)"', line)
        if m:
            item_id = m.group(1)
            item_data = {}
            continue
            
    if in_items_block and block_level == 1 and line == '{':
        block_level += 1
        continue
        
    if in_items_block and block_level == 2:
        if line == '}':
            if 'name' in item_data and item_data['name'].startswith('customplayer_'):
                agents[item_id] = {
                    'name': item_data['name'],
                    'vo_prefix': item_data.get('vo_prefix')
                }
            block_level -= 1
            continue
        m = re.match(r'"([^"]+)"\s*"([^"]+)"', line)
        if m:
            item_data[m.group(1)] = m.group(2)
            continue
            
    if in_items_block and line == '{':
        block_level += 1
    elif in_items_block and line == '}':
        block_level -= 1

print(json.dumps(agents, indent=2))
