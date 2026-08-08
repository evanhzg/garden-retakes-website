import { CS2Inventory, CS2Economy, CS2_ITEMS } from "./node_modules/@ianlucas/cs2-lib/dist/index.mjs";
import { english } from "./node_modules/@ianlucas/cs2-lib/dist/translations/english.mjs";

CS2Economy.load({ items: CS2_ITEMS, language: english });
const inv = new CS2Inventory({ economy: CS2Economy });
inv.add({ id: 50 }); // some weapon
console.log(inv.getAll()[0]);
