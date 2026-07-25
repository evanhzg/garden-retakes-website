"use client";

// BUY MENU — the CS2 economy quiz. All the machinery is in QuizPage; this file
// only supplies the palette and dictionary. The questions are text-and-numbers,
// so there are no images to render.

import React from "react";
import QuizPage, { type QuizTheme } from "@/components/games/quiz/QuizPage";
import { BUYMENU } from "@/components/games/i18n";

const theme: QuizTheme = {
  slug: "buymenu",
  dict: BUYMENU,
  endpoint: "/api/buymenu/quiz",
  rootClass: "bm-page",
  icon: "💰",
};

export default function BuyMenuPage() {
  return <QuizPage theme={theme} />;
}
