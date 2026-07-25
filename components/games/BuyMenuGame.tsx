"use client";

// BUY MENU — race mode in the universal lobby. The screen is shared with BUILD
// PATH; this only supplies the CS2 theme.

import React from "react";
import QuizRaceScreen from "@/components/games/quiz/QuizRaceScreen";
import type { QuizTheme } from "@/components/games/quiz/QuizPage";
import { BUYMENU } from "@/components/games/i18n";

const theme: QuizTheme = {
  slug: "buymenu",
  dict: BUYMENU,
  endpoint: "/api/buymenu/quiz",
  rootClass: "bm-page",
  icon: "💰",
};

export default function BuyMenuGame() {
  return <QuizRaceScreen theme={theme} />;
}
