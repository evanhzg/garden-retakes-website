import { CS2Economy, CS2_ITEMS } from "@ianlucas/cs2-lib";
import { english } from "@ianlucas/cs2-lib/translations/english";

CS2Economy.load({ items: CS2_ITEMS, language: english });
const agents = CS2Economy.itemsAsArray.filter(i => i.isAgent());
console.log(`Found ${agents.length} agents`);
if (agents.length > 0) {
  console.log("Agent 0:", JSON.stringify(agents[0]));
  console.log("Has base?", agents[0].base);
  console.log("Has def?", agents[0].def);
}
