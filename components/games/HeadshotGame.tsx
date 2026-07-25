"use client";

// HEADSHOT — race mode, played from the universal lobby.
//
// The screen itself is shared with PENTAKILL (see guess/RaceScreen); this file
// only wires in the CS pro pool, its board schema and its socket events.

import React from "react";
import { searchPlayers, type HeadshotPlayer } from "@/scripts/headshotRules";
import { HEADSHOT } from "@/components/games/i18n";
import { useHeadshotPool } from "@/components/games/headshot/useHeadshotPool";
import { HEADSHOT_COLUMNS, playerHead, playerOption, flagOf } from "@/components/games/headshot/columns";
import { RaceScreen } from "@/components/games/guess/RaceScreen";

const EMPTY = new Map<string, HeadshotPlayer>();

export default function HeadshotGame() {
  const { pool } = useHeadshotPool();

  return (
    <RaceScreen<HeadshotPlayer>
      dict={HEADSHOT}
      stateEvent="headshot_state"
      guessEvent="headshot_guess"
      columns={HEADSHOT_COLUMNS}
      pool={pool?.players ?? []}
      byId={pool?.byId ?? EMPTY}
      search={searchPlayers}
      renderOption={playerOption}
      renderHead={playerHead}
      renderChip={(chip) => <>{flagOf(chip.cc)} {chip.name}</>}
      headLabel="colPlayer"
      icon="🎯"
      ready={!!pool}
    />
  );
}
