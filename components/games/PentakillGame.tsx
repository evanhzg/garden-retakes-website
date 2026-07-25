"use client";

// PENTAKILL — race mode, played from the universal lobby.
//
// The screen itself is shared with HEADSHOT (see guess/RaceScreen); this file
// only wires in the League champion pool, its board schema and its events.

import React from "react";
import { searchChampions, type LolChampion } from "@/scripts/pentakillRules";
import { PENTAKILL } from "@/components/games/i18n";
import { usePentakillPool } from "@/components/games/pentakill/usePentakillPool";
import { PENTAKILL_COLUMNS, championHead, championOption } from "@/components/games/pentakill/columns";
import { RaceScreen } from "@/components/games/guess/RaceScreen";
import "./pentakill/pentakill.css";

const EMPTY = new Map<string, LolChampion>();
const NO_PORTRAIT = () => "";

export default function PentakillGame() {
  const { pool } = usePentakillPool();
  const portrait = pool?.portrait ?? NO_PORTRAIT;

  return (
    <RaceScreen<LolChampion>
      dict={PENTAKILL}
      stateEvent="pentakill_state"
      guessEvent="pentakill_guess"
      columns={PENTAKILL_COLUMNS}
      pool={pool?.champions ?? []}
      byId={pool?.byId ?? EMPTY}
      search={searchChampions}
      renderOption={championOption(portrait, "en")}
      renderHead={championHead(portrait)}
      renderChip={(chip) => (
        <>
          {pool && <img className="pk-portrait sm" src={`https://ddragon.leagueoflegends.com/cdn/${pool.patch}/img/champion/${chip.image}`} alt="" />}
          {chip.name}
        </>
      )}
      headLabel="colChampion"
      rootClass="pk-race"
      icon="⚔"
      ready={!!pool}
    />
  );
}
