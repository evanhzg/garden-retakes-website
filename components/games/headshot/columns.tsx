"use client";

// The HEADSHOT board schema — shared by the daily page and the lobby race so
// both render an identical grid.

import React from "react";
import type { GuessColumn } from "@/components/games/guess/GuessBoard";
import { ageOf, type HeadshotPlayer } from "@/scripts/headshotRules";
import { translator, HEADSHOT, type Lang } from "@/components/games/i18n";

const ROLE_KEYS: Record<string, string> = {
  awp: "roleAwp", igl: "roleIgl", entry: "roleEntry",
  lurker: "roleLurker", support: "roleSupport", rifle: "roleRifle", coach: "roleCoach",
};

/** ISO alpha-2 → flag image. Falls back to a neutral flag glyph. */
export function flagOf(cc: string): React.ReactNode {
  const code = (cc || "").toLowerCase();
  if (!code || !/^[a-z]{2}$/.test(code)) return "🏳";
  return (
    <img
      src={`https://flagcdn.com/w40/${code}.png`}
      alt={code}
      style={{ display: "inline-block", width: "1.2em", height: "auto", borderRadius: "2px", verticalAlign: "middle" }}
    />
  );
}

export function countryName(p: HeadshotPlayer, lang: Lang): string {
  return lang === "fr" ? p.countryFr || p.country : p.country;
}

export function rolesLabel(roles: string[], t: (k: any, p?: any) => string): string {
  return (roles || []).map((r) => t(ROLE_KEYS[r] ?? "roleRifle")).join(" · ");
}

export const HEADSHOT_COLUMNS: GuessColumn<HeadshotPlayer>[] = [
  {
    key: "nationality",
    label: "colNationality",
    cell: (p, lang) => (
      <>
        <span className="hs-cell-flag">{flagOf(p.cc)}</span>
        <span className="hs-cell-sub">{countryName(p, lang)}</span>
      </>
    ),
  },
  { key: "team", label: "colTeam", cell: (p) => <span className="hs-cell-text">{p.team}</span> },
  {
    key: "role",
    label: "colRole",
    cell: (p, lang) => <span className="hs-cell-text">{rolesLabel(p.roles, translator(HEADSHOT, lang))}</span>,
  },
  { key: "age", label: "colAge", compact: true, cell: (p) => <span className="hs-cell-big">{ageOf(p) ?? "?"}</span> },
  { key: "majors", label: "colMajors", compact: true, cell: (p) => <span className="hs-cell-big">{p.majors}</span> },
];

/** Player name + flag, for the first column of a guess row. */
export function playerHead(p: HeadshotPlayer) {
  return (
    <>
      <span className="hs-cell-flag">{flagOf(p.cc)}</span>
      <span className="hs-cell-name">{p.name}</span>
    </>
  );
}

/** One row of the autocomplete dropdown. */
export function playerOption(p: HeadshotPlayer) {
  return (
    <>
      <span className="hs-sug-flag">{flagOf(p.cc)}</span>
      <span className="hs-sug-name">{p.name}</span>
      <span className="hs-sug-team">{p.team}</span>
    </>
  );
}
