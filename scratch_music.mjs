import { CS2Economy, CS2_ITEMS } from "@ianlucas/cs2-lib";

CS2Economy.load({ items: CS2_ITEMS });
const items = Array.from(CS2Economy.getIt());
const musicKit = items.find(i => i.type === "musickit" || i.category === "musickit" || i.name.toLowerCase().includes("music kit"));
console.log(musicKit);
