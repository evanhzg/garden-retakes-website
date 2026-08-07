import sys

with open('lib/inventory.ts', 'r') as f:
    c = f.read()

c = c.replace(
    'export type ItemKind = "weapon" | "knife" | "gloves";',
    'export type ItemKind = "weapon" | "knife" | "gloves" | "agent" | "patch" | "charm";'
)

c = c.replace(
    '  glovesT?: string;',
    '  glovesT?: string;\n  agentCT?: string;\n  agentT?: string;\n  equippedPatchesCT?: string[];\n  equippedPatchesT?: string[];'
)

c = c.replace(
    'export function emptyLoadout(name: string): Loadout {\n  return { id: newId(), name, equippedCT: {}, equippedT: {} };\n}',
    'export function emptyLoadout(name: string): Loadout {\n  return { id: newId(), name, equippedCT: {}, equippedT: {}, equippedPatchesCT: [], equippedPatchesT: [] };\n}'
)

with open('lib/inventory.ts', 'w') as f:
    f.write(c)

