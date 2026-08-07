import { CS2Economy, CS2_ITEMS } from "@ianlucas/cs2-lib";
import { english } from "@ianlucas/cs2-lib/translations/english";
CS2Economy.load({ items: CS2_ITEMS, language: english });
const agents = CS2Economy.itemsAsArray.filter(i => i.isAgent());
const patches = CS2Economy.itemsAsArray.filter(i => i.isPatch());
const keychains = CS2Economy.itemsAsArray.filter(i => i.isKeychain());
function pick(obj) { return { id: obj.id, def: obj.def, index: obj.index, name: obj.name, base: obj.base, type: obj.type, category: obj.category }; }
console.log("Agent:", pick(agents[0]));
console.log("Patch:", pick(patches[0]));
console.log("Keychain:", pick(keychains[0]));
