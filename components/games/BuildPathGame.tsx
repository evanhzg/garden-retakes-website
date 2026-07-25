"use client";

// BUILD PATH — race mode in the universal lobby. The screen is shared with BUY
// MENU; this only supplies the League theme.

import React, { useEffect, useState } from "react";
import QuizRaceScreen from "@/components/games/quiz/QuizRaceScreen";
import type { QuizTheme } from "@/components/games/quiz/QuizPage";
import { BUILDPATH, lolTerm } from "@/components/games/i18n";

export default function BuildPathGame() {
  const [patch, setPatch] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/pentakill/champions").then((r) => r.json())
      .then((d) => { if (alive) setPatch(d.patch); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const theme: QuizTheme = {
    slug: "buildpath",
    dict: BUILDPATH,
    endpoint: "/api/buildpath/quiz",
    rootClass: "bp-page",
    icon: "🛡",
    term: lolTerm,
    renderImage: (ref, size) => {
      if (!patch) return null;
      if (ref.champion) return <img className={`quiz-img ${size}`} src={`https://ddragon.leagueoflegends.com/cdn/${patch}/img/champion/${ref.champion}.png`} alt="" loading="lazy" />;
      if (ref.image) return <img className={`quiz-img ${size}`} src={`https://ddragon.leagueoflegends.com/cdn/${patch}/img/item/${ref.image}`} alt="" loading="lazy" />;
      return null;
    },
  };

  return <QuizRaceScreen theme={theme} />;
}
