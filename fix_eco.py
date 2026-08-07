import sys

with open('lib/economy.ts', 'r') as f:
    c = f.read()

c = c.replace(
    '| "Knives"\n  | "Gloves";',
    '| "Knives"\n  | "Gloves"\n  | "Agents"\n  | "Patches"\n  | "Charms";'
)
c = c.replace(
    '"Knives",\n  "Gloves",\n]',
    '"Knives",\n  "Gloves",\n  "Agents",\n  "Patches",\n  "Charms",\n]'
)
c = c.replace(
    'Heavy: [],\n    Knives: [],\n    Gloves: [],',
    'Heavy: [],\n    Knives: [],\n    Gloves: [],\n    Agents: [],\n    Patches: [],\n    Charms: [],'
)

add_code = """
    if (item.isAgent()) {
      const entry: WeaponEntry = { id: item.id, def: item.def, name: item.name, model: item.model ?? "", image: item.getImage(), category: "Agents", team: teamOf(item) };
      weaponsByCategory["Agents"].push(entry);
      weaponByDef.set(item.def, entry);
      continue;
    }
    if (item.isPatch()) {
      const entry: WeaponEntry = { id: item.id, def: item.index, name: item.name, model: "", image: item.getImage(), category: "Patches", team: "both" };
      weaponsByCategory["Patches"].push(entry);
      weaponByDef.set(item.index, entry);
      continue;
    }
    if (item.isKeychain()) {
      const entry: WeaponEntry = { id: item.id, def: item.id, name: item.name, model: "", image: item.getImage(), category: "Charms", team: "both" };
      weaponsByCategory["Charms"].push(entry);
      weaponByDef.set(item.id, entry);
      continue;
    }

    if (!item.isWeapon()) continue;"""

c = c.replace('if (!item.isWeapon()) continue;', add_code)

with open('lib/economy.ts', 'w') as f:
    f.write(c)

