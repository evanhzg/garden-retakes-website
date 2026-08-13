import { CS2Economy } from "@ianlucas/cs2-lib";
CS2Economy.use({ items: require("@ianlucas/cs2-lib/dist/items.json") });
console.log(CS2Economy.items.filter(i => i.category === 'Agents').map(i => i.teams));
