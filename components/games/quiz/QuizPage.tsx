"use client";

// The solo quiz page, shared by BUILD PATH and BUY MENU.
//
// A paper is 10 questions at one of four difficulty tiers. "Daily" fixes the
// seed to the UTC date + tier, so everyone in the world gets the same paper and
// can be scored against each other; "Practice" reseeds on every run. Progress,
// streaks and best scores live in localStorage under a per-game key.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useGameLang, translator, LangToggle, QUIZ, type Lang } from "@/components/games/i18n";
import { sound } from "@/components/games/sound/SoundManager";
import SoundControls from "@/components/games/sound/SoundControls";
import "@/components/games/shared.css";
import "@/components/games/quiz/quiz.css";

export type QuizChoice = { id: string; label: string; image?: string; champion?: string; term?: boolean };
export type QuizQuestion = {
  id: string;
  gen: string;
  tier: number;
  type: "mc" | "input";
  prompt: { key: string; params?: Record<string, any> };
  choices?: QuizChoice[];
  answer: string;
  explain?: { key: string; params?: Record<string, any> };
  image?: string;
  champion?: string;
  statLabel?: string;
};

type Mode = "daily" | "practice";

export type QuizTheme = {
  /** localStorage key + share slug. */
  slug: string;
  /** Game dictionary holding the prompt strings and tier names. */
  dict: any;
  endpoint: string;
  rootClass: string;
  icon: string;
  /** Renders an item/champion image for a choice or the prompt. */
  renderImage?: (ref: { image?: string; champion?: string }, size: "sm" | "lg") => React.ReactNode;
  /** Localizes an enum-ish choice label (regions, classes, teams). */
  term?: (value: string, lang: Lang) => string;
};

const COUNT = 10;
const TIERS = [1, 2, 3, 4];

type Saved = { date: string; done: Record<string, number>; streak: number; best: number; played: number; totalCorrect: number; totalAsked: number };

const emptySave = (date: string): Saved => ({ date, done: {}, streak: 0, best: 0, played: 0, totalCorrect: 0, totalAsked: 0 });

function loadSave(key: string, date: string): Saved {
  if (typeof window === "undefined") return emptySave(date);
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return emptySave(date);
    const s = JSON.parse(raw) as Saved;
    if (s.date === date) return { ...emptySave(date), ...s };
    const yesterday = new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    return {
      ...emptySave(date),
      // The streak survives only if yesterday's paper was actually played.
      streak: s.date === yesterday && Object.keys(s.done || {}).length ? s.streak : 0,
      best: s.best ?? 0,
      played: s.played ?? 0,
      totalCorrect: s.totalCorrect ?? 0,
      totalAsked: s.totalAsked ?? 0,
    };
  } catch {
    return emptySave(date);
  }
}

const todayKey = () => new Date().toISOString().slice(0, 10);
const msUntilNextDay = () => (Math.floor(Date.now() / 86400000) + 1) * 86400000 - Date.now();

export default function QuizPage({ theme }: { theme: QuizTheme }) {
  const [lang, setLang] = useGameLang(null);
  const t = translator(QUIZ, lang);
  const g = translator(theme.dict, lang);

  const LS_KEY = `${theme.slug}_v1`;

  const [mode, setMode] = useState<Mode>("daily");
  const [tier, setTier] = useState(1);
  const [date, setDate] = useState(todayKey);
  const [stats, setStats] = useState<Saved | null>(null);

  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [patch, setPatch] = useState<string>("");
  const [countdown, setCountdown] = useState("");
  const [copied, setCopied] = useState(false);
  const [runNonce, setRunNonce] = useState(0);

  useEffect(() => {
    const d = todayKey();
    setDate(d);
    setStats(loadSave(LS_KEY, d));
  }, [LS_KEY]);

  useEffect(() => {
    const tick = () => {
      const ms = msUntilNextDay();
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setCountdown(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const seed = mode === "daily" ? `${theme.slug}:${date}:t${tier}` : `${theme.slug}:practice:${runNonce}`;
  const dailyKey = `t${tier}`;
  const alreadyPlayed = mode === "daily" && stats != null && stats.done[dailyKey] != null;

  // Fetch a paper whenever the seed changes, unless today's is already done.
  useEffect(() => {
    if (alreadyPlayed) { setQuestions(null); return; }
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`${theme.endpoint}?tier=${tier}&count=${COUNT}&seed=${encodeURIComponent(seed)}&lang=${lang}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => {
        if (!alive) return;
        setQuestions(data.questions);
        setPatch(data.patch || "");
        setIndex(0);
        setPicked(null);
        setAnswers([]);
      })
      .catch((e) => { if (alive) setError(String(e.message || e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [seed, tier, lang, theme.endpoint, alreadyPlayed]);

  const current = questions?.[index] ?? null;
  const finished = !!questions && index >= questions.length;
  const score = answers.filter(Boolean).length;

  const choose = useCallback((choiceId: string) => {
    if (!current || picked) return;
    setPicked(choiceId);
    const right = choiceId === current.answer;
    sound.play(right ? "correct" : "error");
    setAnswers((a) => [...a, right]);
  }, [current, picked]);

  const advance = () => {
    if (!questions) return;
    const nextIndex = index + 1;
    setPicked(null);
    setIndex(nextIndex);

    if (nextIndex >= questions.length) {
      sound.play("fanfare");
      const finalScore = answers.filter(Boolean).length;
      if (mode !== "daily") return;
      setStats((prev) => {
        const base = prev ?? emptySave(date);
        const updated: Saved = {
          ...base,
          date,
          done: { ...base.done, [dailyKey]: finalScore },
          streak: Object.keys(base.done).length === 0 ? base.streak + 1 : base.streak,
          best: Math.max(base.best, finalScore),
          played: base.played + 1,
          totalCorrect: base.totalCorrect + finalScore,
          totalAsked: base.totalAsked + questions.length,
        };
        try { window.localStorage.setItem(LS_KEY, JSON.stringify(updated)); } catch {}
        return updated;
      });
    }
  };

  const shareText = useMemo(() => {
    if (!answers.length) return "";
    const grid = answers.map((ok) => (ok ? "🟩" : "🟥")).join("");
    return `${g("brand")} ${g(`tier${tier}` as any)} — ${score}/${answers.length}\n${grid}\nhttps://games.retakes.fr/${theme.slug}`;
  }, [answers, score, tier, g, theme.slug]);

  const doShare = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  };

  const startPractice = () => { setMode("practice"); setRunNonce((n) => n + 1); };

  const verdict = (n: number, m: number) =>
    n === m ? t("resultPerfect") : n / m >= 0.7 ? t("resultGreat") : n / m >= 0.4 ? t("resultOk") : t("resultPoor");

  return (
    <div className={`quiz-page ${theme.rootClass}`}>
      <div className="quiz-aurora" aria-hidden />

      <header className="quiz-topbar">
        <div className="quiz-brand-block">
          <Link href="/games" className="quiz-back" aria-label="Back to games">←</Link>
          <div>
            <h1 className="quiz-brand">{g("brand")}</h1>
            <p className="quiz-tagline">{g("tagline")}</p>
          </div>
        </div>
        <div className="quiz-top-right">
          {patch && <span className="quiz-patch">{g("patchLabel", { v: patch })}</span>}
          <LangToggle lang={lang} onChange={setLang} />
          <SoundControls />
        </div>
      </header>

      <div className="quiz-modes" role="tablist">
        <button role="tab" aria-selected={mode === "daily"} className={`quiz-mode ${mode === "daily" ? "on" : ""}`} onClick={() => setMode("daily")}>
          <span className="quiz-mode-name">{t("modeDaily")}</span>
          <span className="quiz-mode-desc">{t("modeDailyD")}</span>
        </button>
        <button role="tab" aria-selected={mode === "practice"} className={`quiz-mode ${mode === "practice" ? "on" : ""}`} onClick={startPractice}>
          <span className="quiz-mode-name">{t("modePractice")}</span>
          <span className="quiz-mode-desc">{t("modePracticeD")}</span>
        </button>
        <Link href="/games" className="quiz-mode link">
          <span className="quiz-mode-name">⚔ {t("modeRace")}</span>
          <span className="quiz-mode-desc">{t("playWithFriends")}</span>
        </Link>
      </div>

      <div className="quiz-tiers" role="group" aria-label={t("difficulty")}>
        <span className="quiz-tiers-label">{t("difficulty")}</span>
        {TIERS.map((n) => (
          <button
            key={n}
            className={`quiz-tier t${n} ${tier === n ? "on" : ""}`}
            onClick={() => { setTier(n); setPicked(null); }}
            title={g(`tier${n}D` as any)}
          >
            <b>{g(`tier${n}` as any)}</b>
            {mode === "daily" && stats?.done[`t${n}`] != null && <span className="quiz-tier-done">{stats.done[`t${n}`]}/{COUNT}</span>}
          </button>
        ))}
      </div>
      <p className="quiz-tier-desc">{g(`tier${tier}D` as any)}</p>

      {mode === "daily" && stats && (
        <div className="quiz-stats">
          <Stat label={t("streak")} value={stats.streak} />
          <Stat label={t("bestScore")} value={`${stats.best}/${COUNT}`} />
          <Stat label={t("played")} value={stats.played} />
          <Stat label={t("accuracy")} value={stats.totalAsked ? `${Math.round((stats.totalCorrect / stats.totalAsked) * 100)}%` : "—"} />
        </div>
      )}

      <main className="quiz-main">
        {alreadyPlayed ? (
          <div className="quiz-done-card">
            <span className="quiz-done-kicker">{t("alreadyPlayed", { tier: g(`tier${tier}` as any) })}</span>
            <b className="quiz-done-score">{t("yourResult", { n: stats!.done[dailyKey], m: COUNT })}</b>
            <span className="quiz-done-next">{t("nextIn", { t: countdown })}</span>
            <button className="quiz-primary" onClick={startPractice}>{t("modePractice")} ▸</button>
          </div>
        ) : error ? (
          <div className="quiz-loading">
            <p>{t("loadFailed")}</p>
            <button className="quiz-primary" onClick={() => setRunNonce((n) => n + 1)}>{t("retry")}</button>
          </div>
        ) : loading || !questions ? (
          <div className="quiz-loading"><span className="quiz-spinner" />{t("loading")}</div>
        ) : finished ? (
          <ResultCard
            score={score}
            total={questions.length}
            verdict={verdict(score, questions.length)}
            answers={answers}
            t={t}
            copied={copied}
            onShare={doShare}
            onAgain={startPractice}
            onHarder={tier < 4 ? () => { setTier(tier + 1); setRunNonce((n) => n + 1); } : undefined}
            harderLabel={t("harder")}
            countdown={mode === "daily" ? countdown : null}
          />
        ) : current ? (
          <QuestionCard
            key={current.id}
            question={current}
            index={index}
            total={questions.length}
            picked={picked}
            onPick={choose}
            onNext={advance}
            t={t}
            g={g}
            lang={lang}
            theme={theme}
            isLast={index === questions.length - 1}
          />
        ) : null}
      </main>

      <footer className="quiz-footer">
        <span>{g("dataFrom")}</span>
      </footer>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="quiz-stat"><b>{value}</b><span>{label}</span></div>;
}

function QuestionCard({ question, index, total, picked, onPick, onNext, t, g, lang, theme, isLast }: {
  question: QuizQuestion;
  index: number;
  total: number;
  picked: string | null;
  onPick: (id: string) => void;
  onNext: () => void;
  t: (k: any, p?: any) => string;
  g: (k: any, p?: any) => string;
  lang: Lang;
  theme: QuizTheme;
  isLast: boolean;
}) {
  // Prompt params can themselves be translation keys (a stat name, a team).
  const params = { ...(question.prompt.params || {}) };
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string" && /^(stat|team)[A-Z]/.test(v)) params[k] = g(v as any);
    else if (typeof v === "string" && theme.term) params[k] = theme.term(v, lang);
  }
  const promptText = g(question.prompt.key as any, params);
  const right = picked != null && picked === question.answer;

  const labelFor = (c: QuizChoice) => {
    if (c.term) {
      // Enum-ish values: a dictionary key first, then the game's own localizer.
      const viaDict = g(c.label as any);
      if (viaDict !== c.label) return viaDict;
      return theme.term ? theme.term(c.label, lang) : c.label;
    }
    return c.label;
  };

  const explainParams = { ...(question.explain?.params || {}) };
  for (const [k, v] of Object.entries(explainParams)) {
    if (typeof v === "string" && /^(stat|team)[A-Z]/.test(v)) explainParams[k] = g(v as any);
  }

  return (
    <motion.div
      className="quiz-card"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 280, damping: 24 }}
    >
      <div className="quiz-progress">
        <span>{t("question", { n: index + 1, m: total })}</span>
        <div className="quiz-progress-bar"><span style={{ transform: `scaleX(${(index) / total})` }} /></div>
      </div>

      <div className="quiz-prompt-row">
        {theme.renderImage?.({ image: question.image, champion: question.champion }, "lg")}
        <h2 className="quiz-prompt">{promptText}</h2>
      </div>

      <div className={`quiz-choices ${question.choices && question.choices.length === 3 ? "three" : ""}`}>
        {(question.choices || []).map((c, i) => {
          const state = picked == null ? ""
            : c.id === question.answer ? "right"
            : c.id === picked ? "wrong"
            : "dim";
          return (
            <motion.button
              key={c.id}
              className={`quiz-choice ${state}`}
              disabled={picked != null}
              onClick={() => onPick(c.id)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              whileHover={picked == null ? { y: -2 } : undefined}
              whileTap={picked == null ? { scale: 0.98 } : undefined}
            >
              {theme.renderImage?.({ image: c.image, champion: c.champion }, "sm")}
              <span className="quiz-choice-label">{labelFor(c)}</span>
              {state === "right" && <span className="quiz-choice-mark">✓</span>}
              {state === "wrong" && <span className="quiz-choice-mark">✕</span>}
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence>
        {picked != null && (
          <motion.div
            className={`quiz-feedback ${right ? "right" : "wrong"}`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <b>{right ? t("correct") : t("wrong")}</b>
            {question.explain && <span>{g(question.explain.key as any, explainParams)}</span>}
            <button className="quiz-primary" onClick={onNext} autoFocus>
              {isLast ? t("finish") : t("next")} ▸
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ResultCard({ score, total, verdict, answers, t, copied, onShare, onAgain, onHarder, harderLabel, countdown }: {
  score: number; total: number; verdict: string; answers: boolean[];
  t: (k: any, p?: any) => string;
  copied: boolean;
  onShare: () => void;
  onAgain: () => void;
  onHarder?: () => void;
  harderLabel: string;
  countdown: string | null;
}) {
  return (
    <motion.div
      className="quiz-result"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 240, damping: 20 }}
    >
      <span className="quiz-result-score">{t("resultTitle", { n: score, m: total })}</span>
      <span className="quiz-result-verdict">{verdict}</span>
      <div className="quiz-result-grid">
        {answers.map((ok, i) => <span key={i} className={ok ? "ok" : "no"} />)}
      </div>
      <div className="quiz-result-actions">
        <button className="quiz-primary" onClick={onShare}>{copied ? `✓ ${t("copied")}` : `📋 ${t("share")}`}</button>
        <button className="quiz-ghost" onClick={onAgain}>{t("playAgain")} ↻</button>
        {onHarder && <button className="quiz-ghost" onClick={onHarder}>{harderLabel} ▸</button>}
      </div>
      {countdown && <span className="quiz-result-next">{t("nextIn", { t: countdown })}</span>}
    </motion.div>
  );
}
