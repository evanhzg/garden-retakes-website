import sys

with open('lib/economy.ts', 'r') as f:
    c = f.read()

c = c.replace(
    'def: item.index',
    'def: item.index ?? 0'
)

c = c.replace(
    'weaponByDef.set(item.index, entry);',
    'weaponByDef.set(item.index ?? 0, entry);'
)

with open('lib/economy.ts', 'w') as f:
    f.write(c)

