import sys

with open('lib/inventory.ts', 'r') as f:
    c = f.read()

c = c.replace(
    '  gloves: Record<number, PluginWeapon>;\n};',
    '  gloves: Record<number, PluginWeapon>;\n  agents: Record<number, PluginWeapon>;\n  patches: Record<number, PluginWeapon>;\n};'
)

c = c.replace(
    '  const result: EquippedV4 = { ctWeapons: {}, tWeapons: {}, knives: {}, gloves: {} };',
    '  const result: EquippedV4 = { ctWeapons: {}, tWeapons: {}, knives: {}, gloves: {}, agents: {}, patches: {} };'
)

# Insert the code for agent and patches
add_code = """
  const agentT = itemById(loadout.agentT);
  if (agentT) result.agents[2] = toPluginWeapon(agentT);
  const agentCT = itemById(loadout.agentCT);
  if (agentCT) result.agents[3] = toPluginWeapon(agentCT);

  // Patches aren't currently bound to teams cleanly in PluginWeapon structure so we can just leave patches map empty or add if needed.
"""
c = c.replace(
    '  const glovesCT = itemById(loadout.glovesCT);\n  if (glovesCT) result.gloves[3] = toPluginWeapon(glovesCT);\n\n  return result;\n}',
    '  const glovesCT = itemById(loadout.glovesCT);\n  if (glovesCT) result.gloves[3] = toPluginWeapon(glovesCT);\n\n' + add_code + '\n  return result;\n}'
)

with open('lib/inventory.ts', 'w') as f:
    f.write(c)
