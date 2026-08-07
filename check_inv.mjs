import * as cs2 from "@ianlucas/cs2-lib";
console.log(Object.keys(cs2).filter(k => k.toLowerCase().includes('parse') || k.toLowerCase().includes('decode')));
