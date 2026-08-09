import { CS2Economy, CS2_ITEMS } from "@ianlucas/cs2-lib";

CS2Economy.load({ items: CS2_ITEMS });
console.log(CS2Economy.getById(5).type, CS2Economy.getById(5).category);
