"use client";

// PENTAKILL — the solo half: today's champion (shared by everyone) plus an
// endless practice mode. No socket, no account: progress lives in localStorage
// and the answer is a pure function of the UTC date, so two people opening the
// page in different countries are chasing the same champion.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  compare, pickDaily, todayKey, msUntilNextDay, seededShuffle, searchChampions,
  type LolChampion,
} from "@/scripts/pentakillRules";
import { usePentakillPool } from "@/components/games/pentakill/usePentakillPool";
import { PENTAKILL_COLUMNS, championHead, championOption } from "@/components/games/pentakill/columns";
import { SearchBox, GuessGrid, Legend, shareSquares, ColumnToggles, type GuessRow } from "@/components/games/guess/GuessBoard";
import { useGameLang, translator, LangToggle, lolTerm, PENTAKILL } from "@/components/games/i18n";
import { useI18n } from '@/components/I18nProvider';
import { sound } from "@/components/games/sound/SoundManager";
import SoundControls from "@/components/games/sound/SoundControls";
import "@/components/games/shared.css";
import "@/components/games/headshot/headshot.css";
import "@/components/games/pentakill/pentakill.css";

type Mode = "daily" | "endless";

const LS_KEY = "pentakill_v1";
// Puzzle #1 is the day PENTAKILL shipped; only used for the share text.
const EPOCH = Date.UTC(2026, 0, 1);

type Saved = {
  date: string;
  guesses: string[];
  won: boolean;
  streak: number;
  best: number;
  played: number;
  totalGuesses: number;
};

const emptySave = (date: string): Saved => ({
  date, guesses: [], won: false, streak: 0, best: 0, played: 0, totalGuesses: 0,
});

function loadSave(date: string): Saved {
  if (typeof window === "undefined") return emptySave(date);
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return emptySave(date);
    const s = JSON.parse(raw) as Saved;
    if (s.date === date) return { ...emptySave(date), ...s };
    // A new day: carry the record over, and keep the streak only if the last
    // solved puzzle was yesterday's.
    const yesterday = new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    return {
      ...emptySave(date),
      streak: s.won && s.date === yesterday ? s.streak : 0,
      best: s.best ?? 0,
      played: s.played ?? 0,
      totalGuesses: s.totalGuesses ?? 0,
    };
  } catch {
    return emptySave(date);
  }
}

const save = (s: Saved) => {
  try { window.localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
};

export default function PentakillPage() {
    const { t } = useI18n();

  const { pool, error, retry } = usePentakillPool();
  const [lang, setLang] = useGameLang(null);
  const t = translator(PENTAKILL, lang);

  const [mode, setMode] = useState<Mode>("daily");
  const [date, setDate] = useState<string>(() => todayKey());
  const [stats, setStats] = useState<Saved | null>(null);
  const [guessIds, setGuessIds] = useState<string[]>([]);
  const [endlessSeed, setEndlessSeed] = useState(0);
  const [countdown, setCountdown] = useState("");
  const [copied, setCopied] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);

  const [activeCols, setActiveCols] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("garden_cols_colChampion");
      if (saved) return new Set(JSON.parse(saved));
    }
    return new Set(PENTAKILL_COLUMNS.map(c => c.key));
  });

  const toggleCol = useCallback((key: string) => {
    setActiveCols(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (next.size === 0) next.add(key);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("garden_cols_colChampion", JSON.stringify(Array.from(next)));
      }
      return next;
    });
  }, []);

  const activeColumns = useMemo(() => PENTAKILL_COLUMNS.filter(c => activeCols.has(c.key)), [activeCols]);

  useEffect(() => {
    const d = todayKey();
    setDate(d);
    const s = loadSave(d);
    setStats(s);
    setGuessIds(s.guesses);
  }, []);

  // Tick the "next champion in …" clock, and roll over at midnight UTC.
  useEffect(() => {
    const tick = () => {
      const ms = msUntilNextDay();
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setCountdown(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
      const d = todayKey();
      if (d !== date) { setDate(d); const fresh = loadSave(d); setStats(fresh); setGuessIds(fresh.guesses); setGaveUp(false); }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [date]);

  const target: LolChampion | null = useMemo(() => {
    if (!pool) return null;
    if (mode === "daily") return pickDaily(pool.champions, date, "pentakill:daily");
    const deck = seededShuffle(pool.champions, `pentakill:endless:${date}`);
    return deck.length ? deck[endlessSeed % deck.length] : null;
  }, [pool, mode, date, endlessSeed]);

  const rows: GuessRow<LolChampion>[] = useMemo(() => {
    if (!pool || !target) return [];
    return guessIds
      .map((id) => pool.byId.get(id))
      .filter(Boolean)
      .map((c) => ({ item: c as LolChampion, result: compare(c as LolChampion, target) }));
  }, [guessIds, pool, target]);

  const won = rows.some((r) => r.result.correct);
  const finished = won || gaveUp;

  const submit = useCallback((c: LolChampion) => {
    if (!target || finished) return;
    const next = [...guessIds, c.id];
    setGuessIds(next);

    const correct = c.id === target.id;
    sound.play(correct ? "win" : "click");

    if (mode !== "daily") return;
    setStats((prev) => {
      const base = prev ?? emptySave(date);
      const updated: Saved = correct
        ? {
          ...base, date, guesses: next, won: true,
          streak: base.streak + 1,
          best: Math.max(base.best, base.streak + 1),
          played: base.played + 1,
          totalGuesses: base.totalGuesses + next.length,
        }
        : { ...base, date, guesses: next };
      save(updated);
      return updated;
    });
  }, [target, finished, guessIds, mode, date]);

  const giveUp = () => {
    if (finished) return;
    setGaveUp(true);
    sound.play("bankrupt");
    if (mode !== "daily") return;
    setStats((prev) => {
      const base = prev ?? emptySave(date);
      const updated = { ...base, date, guesses: guessIds, won: false, streak: 0, played: base.played + 1 };
      save(updated);
      return updated;
    });
  };

  const nextEndless = () => { setEndlessSeed((s) => s + 1); setGuessIds([]); setGaveUp(false); };

  const switchMode = (m: Mode) => {
    setMode(m);
    setGaveUp(false);
    if (m === "daily") setGuessIds(stats?.guesses ?? []);
    else { setGuessIds([]); setEndlessSeed((s) => s + 1); }
  };

  const puzzleNumber = Math.max(1, Math.floor((Date.parse(`${date}T00:00:00Z`) - EPOCH) / 86400000) + 1);

  const shareText = useMemo(() => {
    if (!rows.length) return "";
    const head = `${t("puzzleNo", { n: puzzleNumber })} — ${won ? rows.length : "X"}/∞`;
    const body = rows.slice(0, 12).map((r) => shareSquares(r.result, activeColumns)).join("\n");
    return `${head}\n${body}\nhttps://games.retakes.fr/pentakill`;
  }, [rows, won, puzzleNumber, t, activeColumns]);

  const doShare = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked — nothing useful to do */ }
  };

  return (
    <div className="hs-page pk-page">
      <div className="hs-aurora" aria-hidden />

      <header className="hs-topbar">
        <div className="hs-brand-block">
          <Link href="/games" className="hs-back" aria-label={t("auto.page.back_to_games")}>←</Link>
          <div>
            <h1 className="hs-brand pk-brand">{t("brand")}</h1>
            <p className="hs-tagline">{t("tagline")}</p>
          </div>
        </div>
        <div className="hs-top-right">
          {pool && <span className="pk-patch">{t("patchLabel", { v: pool.patch })}</span>}
          <LangToggle lang={lang} onChange={setLang} />
          <SoundControls />
        </div>
      </header>

      <div className="hs-modes" role="tablist">
        {(["daily", "endless"] as Mode[]).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            className={`hs-mode ${mode === m ? "on" : ""}`}
            onClick={() => switchMode(m)}
          >
            <span className="hs-mode-name">{m === "daily" ? t("modeDaily") : t("modeEndless")}</span>
            <span className="hs-mode-desc">{m === "daily" ? t("modeDailyD") : t("modeEndlessD")}</span>
          </button>
        ))}
        <Link href="/games" className="hs-mode link">
          <span className="hs-mode-name">⚔ {t("modeRace")}</span>
          <span className="hs-mode-desc">{t("playWithFriends")}</span>
        </Link>
      </div>

      {mode === "daily" && stats && (
        <div className="hs-stats">
          <Stat label={t("streak")} value={stats.streak} />
          <Stat label={t("bestStreak")} value={stats.best} />
          <Stat label={t("played")} value={stats.played} />
          <Stat label={t("avgGuesses")} value={stats.played ? (stats.totalGuesses / stats.played).toFixed(1) : "—"} />
        </div>
      )}

      <main className="hs-main">
        {error ? (
          <div className="hs-loading">
            <p>{t("loadFailed")}</p>
            <button className="hs-primary" onClick={retry}>{t("retry")}</button>
          </div>
        ) : !pool || !target ? (
          <div className="hs-loading"><span className="hs-spinner" />{t("loading")}</div>
        ) : (
          <>
            <div className="hs-play">
              {!finished ? (
                <SearchBox
                  pool={pool.champions}
                  exclude={guessIds}
                  onPick={submit}
                  autoFocus
                  icon="⚔"
                  placeholder={t("searchPlaceholder")}
                  emptyLabel={t("noMatches")}
                  search={searchChampions}
                  renderOption={championOption(pool.portrait, lang)}
                />
              ) : (
                <ResultCard
                  target={target}
                  portrait={pool.portrait}
                  won={won}
                  guesses={rows.length}
                  lang={lang}
                  t={t}
                  countdown={countdown}
                  mode={mode}
                  copied={copied}
                  onShare={doShare}
                  onNext={nextEndless}
                  onEndless={() => switchMode("endless")}
                />
              )}

              <div className="hs-play-meta">
                <span className="hs-guess-count">
                  {rows.length === 1 ? t("oneGuess") : t("guessCount", { n: rows.length })}
                </span>
                {!finished && rows.length > 0 && (
                  <button className="hs-ghost" onClick={giveUp}>{t("giveUp")}</button>
                )}
                {!finished && mode === "endless" && (
                  <button className="hs-ghost" onClick={nextEndless}>{t("newChampion")} ↻</button>
                )}
              </div>
            </div>

            <ColumnToggles columns={PENTAKILL_COLUMNS} active={activeCols} onToggle={toggleCol} t={t} />
            <GuessGrid
              rows={[...rows].reverse()}
              columns={activeColumns}
              lang={lang}
              t={t}
              headLabel={t("colChampion")}
              renderHead={championHead(pool.portrait)}
            />
            {rows.length === 0 && <Legend t={t} />}
          </>
        )}
      </main>

      <footer className="hs-footer">
        <span>{t("dataFrom")}</span>
        {pool && <span className="hs-footer-dim">· {new Date(pool.generatedAt).toISOString().slice(0, 10)}</span>}
      </footer>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="hs-stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function ResultCard({ target, portrait, won, guesses, lang, t, countdown, mode, copied, onShare, onNext, onEndless }: {
  target: LolChampion;
  portrait: (c: LolChampion) => string;
  won: boolean;
  guesses: number;
  lang: any;
  t: (k: any, p?: any) => string;
  countdown: string;
  mode: Mode;
  copied: boolean;
  onShare: () => void;
  onNext: () => void;
  onEndless: () => void;
}) {
  return (
    <AnimatePresence>
      <motion.div
        className={`hs-result ${won ? "won" : "lost"}`}
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
      >
        <span className="hs-result-kicker">{won ? t("solved") : t("theAnswerWas")}</span>
        <div className="hs-result-player">
          <img className="pk-portrait lg" src={portrait(target)} alt="" />
          <div className="hs-result-names">
            <b>{lang === "fr" ? target.nameFr : target.name}</b>
            <span>{lang === "fr" ? target.titleFr : target.title}</span>
          </div>
        </div>
        <div className="hs-result-facts">
          <span>{target.classes.map((c) => lolTerm(c, lang)).join(" · ")}</span>
          <span>{target.positions.map((p) => lolTerm(p, lang)).join(" · ")}</span>
          <span>{target.regions.map((r) => lolTerm(r, lang)).join(" · ")}</span>
          <span>{target.releaseYear}</span>
        </div>
        {won && <span className="hs-result-count">{t("solvedIn", { n: guesses === 1 ? t("oneGuess") : t("guessCount", { n: guesses }) })}</span>}

        <div className="hs-result-actions">
          {mode === "daily" ? (
            <>
              <button className="hs-primary" onClick={onShare}>{copied ? `✓ ${t("copied")}` : `📋 ${t("share")}`}</button>
              <button className="hs-ghost" onClick={onEndless}>{t("playEndless")} ▸</button>
            </>
          ) : (
            <button className="hs-primary" onClick={onNext}>{t("newChampion")} ↻</button>
          )}
        </div>
        {mode === "daily" && <span className="hs-result-next">{t("nextIn", { t: countdown })}</span>}
      </motion.div>
    </AnimatePresence>
  );
}
