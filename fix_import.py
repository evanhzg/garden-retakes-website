import sys

with open('components/inventory/InventorySimulator.tsx', 'r') as f:
    c = f.read()

import_cstrike_fn = """
  const importCstrike = async (raw: string) => {
    const payload = raw.trim();
    if (!payload) return;
    setShareBusy(true);
    try {
      const res = await fetch("/api/loadout/import-cstrike", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      });
      const j = await res.json();
      if (!res.ok || !j.loadout) {
        showToast(j.error ?? "Import failed");
        return;
      }
      setStore((cur) => {
        let maxUid = cur.nextUid;
        for (const i of j.items) if (i.uid >= maxUid) maxUid = i.uid + 1;
        return {
          ...cur,
          items: [...cur.items, ...j.items],
          loadouts: [...cur.loadouts, j.loadout],
          activeLoadoutId: j.loadout.id,
          nextUid: maxUid,
        };
      });
      setImportKey("");
      showToast("Imported from cstrike");
    } finally {
      setShareBusy(false);
    }
  };
"""

c = c.replace(
    '  const importByKey = useCallback(',
    import_cstrike_fn + '\n  const importByKey = useCallback('
)

c = c.replace(
    '              importByKey(importKey);\n            }}',
    '              if (importKey.includes("cstrike.app") || importKey.startsWith("[")) { importCstrike(importKey); } else { importByKey(importKey); }\n            }}'
)

c = c.replace(
    '              maxLength={16}',
    '              // removed max length for cstrike json payloads'
)

with open('components/inventory/InventorySimulator.tsx', 'w') as f:
    f.write(c)

