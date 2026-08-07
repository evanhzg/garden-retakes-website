import sys

with open('components/inventory/InventorySimulator.tsx', 'r') as f:
    c = f.read()

# Fix slotItemFor
c = c.replace(
    '      if (kind === "gloves") {\n        const item = itemById(s === "t" ? loadout.glovesT : loadout.glovesCT);\n        return item?.weaponDef === def ? item : undefined;\n      }',
    '      if (kind === "gloves") {\n        const item = itemById(s === "t" ? loadout.glovesT : loadout.glovesCT);\n        return item?.weaponDef === def ? item : undefined;\n      }\n      if (kind === "agent") {\n        const item = itemById(s === "t" ? loadout.agentT : loadout.agentCT);\n        return item?.weaponDef === def ? item : undefined;\n      }'
)

# Fix slotItemForChooser
c = c.replace(
    '      if (kind === "gloves") return itemById(s === "t" ? loadout.glovesT : loadout.glovesCT);',
    '      if (kind === "gloves") return itemById(s === "t" ? loadout.glovesT : loadout.glovesCT);\n      if (kind === "agent") return itemById(s === "t" ? loadout.agentT : loadout.agentCT);'
)

# Fix equipSkin
c = c.replace(
    '        } else if (kind === "gloves") {\n          if (side === "t") nl.glovesT = itemId;\n          else nl.glovesCT = itemId;\n        } else if (side === "t") nl.equippedT[weapon.def] = itemId;',
    '        } else if (kind === "gloves") {\n          if (side === "t") nl.glovesT = itemId;\n          else nl.glovesCT = itemId;\n        } else if (kind === "agent") {\n          if (side === "t") nl.agentT = itemId;\n          else nl.agentCT = itemId;\n        } else if (side === "t") nl.equippedT[weapon.def] = itemId;'
)

# Fix clearSlot
c = c.replace(
    '        } else if (kind === "gloves") {\n          if (side === "t") nl.glovesT = undefined;\n          else nl.glovesCT = undefined;\n        } else if (side === "t") delete nl.equippedT[def];',
    '        } else if (kind === "gloves") {\n          if (side === "t") nl.glovesT = undefined;\n          else nl.glovesCT = undefined;\n        } else if (kind === "agent") {\n          if (side === "t") nl.agentT = undefined;\n          else nl.agentCT = undefined;\n        } else if (side === "t") delete nl.equippedT[def];'
)

# Fix pruneItems
c = c.replace(
    '      [l.knifeCT, l.knifeT, l.glovesCT, l.glovesT].forEach((id) => id && used.add(id));',
    '      [l.knifeCT, l.knifeT, l.glovesCT, l.glovesT, l.agentCT, l.agentT].forEach((id) => id && used.add(id));\n      l.equippedPatchesCT?.forEach(id => id && used.add(id));\n      l.equippedPatchesT?.forEach(id => id && used.add(id));'
)

# Fix boardFor (add agents)
c = c.replace(
    '      const gloveItem = itemById(s === "t" ? activeLoadout.glovesT : activeLoadout.glovesCT);',
    '      const gloveItem = itemById(s === "t" ? activeLoadout.glovesT : activeLoadout.glovesCT);\n      const agentItem = itemById(s === "t" ? activeLoadout.agentT : activeLoadout.agentCT);'
)
c = c.replace(
    '        { key: `${s}-gloves`, def: gloveItem?.weaponDef ?? -1, kind: "gloves", label: "Gloves", item: gloveItem },',
    '        { key: `${s}-gloves`, def: gloveItem?.weaponDef ?? -1, kind: "gloves", label: "Gloves", item: gloveItem },\n        { key: `${s}-agent`, def: agentItem?.weaponDef ?? -1, kind: "agent", label: "Agent", item: agentItem },'
)

# Fix openBoardSlot (agents)
c = c.replace(
    '      const cat = slot.kind === "knife" ? "Knives" : "Gloves";',
    '      const cat = slot.kind === "knife" ? "Knives" : slot.kind === "gloves" ? "Gloves" : slot.kind === "agent" ? "Agents" : slot.kind === "patch" ? "Patches" : slot.kind === "charm" ? "Charms" : "Gloves";'
)

# Fix boardGroups
c = c.replace(
    '      const g = slot.kind === "knife" ? "Knives" : slot.kind === "gloves" ? "Gloves" : categoryOf(slot.def);',
    '      const g = slot.kind === "knife" ? "Knives" : slot.kind === "gloves" ? "Gloves" : slot.kind === "agent" ? "Agents" : slot.kind === "patch" ? "Patches" : slot.kind === "charm" ? "Charms" : categoryOf(slot.def);'
)

with open('components/inventory/InventorySimulator.tsx', 'w') as f:
    f.write(c)

