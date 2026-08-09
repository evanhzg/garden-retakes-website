import { CS2_ITEMS, CS2Economy } from "@ianlucas/cs2-lib";
import { english } from "@ianlucas/cs2-lib/translations/english";
CS2Economy.load({ items: CS2_ITEMS, language: english });

const mapping = {};
const agents = CS2Economy.itemsAsArray.filter(i => i.isAgent());
agents.forEach(a => {
  const model = a.model.toLowerCase();
  const name = a.name.toLowerCase();
  let folder = "";
  
  if (model.includes("leet")) folder = "leet_epic";
  else if (model.includes("tm_balkan")) folder = "balkan_epic";
  else if (model.includes("fbi")) folder = "fbihrt_epic";
  else if (model.includes("professional")) {
    if (name.includes("sally") || name.includes("safecracker") || name.includes("fem")) folder = "professional_fem";
    else folder = "professional_epic";
  }
  else if (model.includes("gendarmerie")) {
    if (name.includes("rouchard")) folder = "gendarmerie_fem_epic";
    else if (name.includes("fem")) folder = "gendarmerie_fem";
  }
  else if (model.includes("diver")) {
    if (name.includes("davida")) folder = "seal_diver_01";
    else if (name.includes("frank")) folder = "seal_diver_02";
    else folder = "seal_diver_03";
  }
  else if (model.includes("st6")) {
    folder = "seal_epic";
  }
  else if (model.includes("jungle_raider")) {
    if (name.includes("vypa")) folder = "jungle_fem_epic";
    else if (name.includes("fem")) folder = "jungle_fem";
    else folder = "jungle_male_epic";
  }
  else if (model.includes("swat")) {
    if (name.includes("mae") || name.includes("farlow")) folder = "swat_fem";
    else folder = "swat_epic";
  }
  
  if (folder) {
    mapping[a.id] = folder;
  }
});
console.log(JSON.stringify(mapping, null, 2));
