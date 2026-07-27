"use client";

// The PENTAKILL board schema — shared by the daily page and the lobby race so
// both render an identical grid.

import React from "react";
import type { GuessColumn } from "@/components/games/guess/GuessBoard";
import type { LolChampion } from "@/scripts/pentakillRules";
import { lolTerm, type Lang } from "@/components/games/i18n";

const list = (values: string[], lang: Lang) => values.map((v) => lolTerm(v, lang)).join(" · ");

export const PENTAKILL_COLUMNS: GuessColumn<LolChampion>[] = [
  { key: "classes", label: "colClass", cell: (c, lang) => <span className="hs-cell-text">{list(c.classes, lang)}</span> },
  { key: "positions", label: "colPosition", cell: (c, lang) => <span className="hs-cell-text">{list(c.positions, lang)}</span> },
  { key: "regions", label: "colRegion", cell: (c, lang) => <span className="hs-cell-text">{list(c.regions, lang)}</span> },
  { key: "resource", label: "colResource", cell: (c, lang) => <span className="hs-cell-text">{lolTerm(c.resource, lang)}</span> },
  { key: "rangeType", label: "colRange", cell: (c, lang) => <span className="hs-cell-text">{lolTerm(c.rangeType, lang)}</span> },
  { key: "damageType", label: "colDamage", cell: (c, lang) => <span className="hs-cell-text">{lolTerm(c.damageType, lang)}</span> },
  { key: "releaseYear", label: "colYear", compact: true, cell: (c) => <span className="hs-cell-big">{c.releaseYear ?? "?"}</span> },
  { key: "difficulty", label: "colDifficulty", compact: true, cell: (c) => <span className="hs-cell-big">{c.difficulty ?? "?"}</span> },
  { key: "attackRange", label: "colAttackRange", compact: true, cell: (c) => <span className="hs-cell-big">{c.attackRange ?? "?"}</span> },
  { key: "be", label: "colBlueEssence", compact: true, cell: (c) => <span className="hs-cell-big">{c.be ?? "?"}</span> },
];

/** Champion name + portrait, for the first column of a guess row. */
export function championHead(portrait: (c: LolChampion) => string) {
  return function Head(c: LolChampion, lang: Lang) {
    return (
      <>
        <img className="pk-portrait" src={portrait(c)} alt="" loading="lazy" />
        <span className="hs-cell-name">{lang === "fr" ? c.nameFr : c.name}</span>
      </>
    );
  };
}

/** One row of the autocomplete dropdown. */
export function championOption(portrait: (c: LolChampion) => string, lang: Lang) {
  return function Option(c: LolChampion) {
    return (
      <>
        <img className="pk-portrait sm" src={portrait(c)} alt="" loading="lazy" />
        <span className="hs-sug-name">{lang === "fr" ? c.nameFr : c.name}</span>
        <span className="hs-sug-team">{lang === "fr" ? c.titleFr : c.title}</span>
      </>
    );
  };
}
