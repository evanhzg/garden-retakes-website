import * as cs2 from "@ianlucas/cs2-lib";
console.log(Object.keys(cs2).filter(k => k.toLowerCase().includes('cstrike') || k.toLowerCase().includes('export') || k.toLowerCase().includes('import') || k.toLowerCase().includes('inventory')));
