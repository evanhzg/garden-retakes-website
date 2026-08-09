import { CS2Economy, CS2_ITEMS } from "@ianlucas/cs2-lib";
import { english } from "@ianlucas/cs2-lib/translations/english.js";

CS2Economy.load({ items: CS2_ITEMS, language: english });
const item = CS2Economy.items.find(i => i.type === "musickit" || i.category === "musickit" || i.name.toLowerCase().includes("music kit"));
console.log(item ? item : "Not found");
