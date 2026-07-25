"use client";

// BUILD PATH — the LoL item / champion quiz. All the machinery is in QuizPage;
// this file supplies the League palette, the Data Dragon image URLs and the
// localizer for enum-ish answers (regions, classes, positions).

import React, { useEffect, useState } from "react";
import QuizPage, { type QuizTheme } from "@/components/games/quiz/QuizPage";
import { BUILDPATH, lolTerm } from "@/components/games/i18n";

export default function BuildPathPage() {
  // The image CDN is patch-scoped, so the patch has to be known before any
  // icon can be built; the champion endpoint already reports it.
  const [patch, setPatch] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/pentakill/champions")
      .then((r) => r.json())
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
      if (ref.champion) {
        return <img className={`quiz-img ${size}`} src={`https://ddragon.leagueoflegends.com/cdn/${patch}/img/champion/${ref.champion}.png`} alt="" loading="lazy" />;
      }
      if (ref.image) {
        return <img className={`quiz-img ${size}`} src={`https://ddragon.leagueoflegends.com/cdn/${patch}/img/item/${ref.image}`} alt="" loading="lazy" />;
      }
      return null;
    },
  };

  return <QuizPage theme={theme} />;
}
