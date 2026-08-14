"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft, X } from "lucide-react";

// A first-time walkthrough for the matchmaking lobby, for a signed-in player
// who has never saved a loadout. It spotlights the real controls — the role
// picker and the queue button already on this page — rather than a fake copy
// of them, so what someone learns here is exactly the UI they will use every
// other time. Skippable at every step; seen once, it never auto-starts again
// (see GardenOnboardingState / /api/onboarding).

type Step = {
  target?: string; // data-tutorial selector; omitted = a centered card, no spotlight
  titleKey: string;
  bodyKey: string;
};

const STEPS: Step[] = [
  { titleKey: "tutorial.welcome.title", bodyKey: "tutorial.welcome.body" },
  { target: "role-picker", titleKey: "tutorial.role.title", bodyKey: "tutorial.role.body" },
  { target: "queue-play", titleKey: "tutorial.queue.title", bodyKey: "tutorial.queue.body" },
  { titleKey: "tutorial.loadout.title", bodyKey: "tutorial.loadout.body" },
];

function useSpotlightRect(selector?: string) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    const update = () => {
      const el = document.querySelector(`[data-tutorial="${selector}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const id = window.setInterval(update, 300); // layout still settling (party joins, role toggles)
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.clearInterval(id);
    };
  }, [selector]);

  return rect;
}

export default function MatchmakingWalkthrough({ signedIn }: { signedIn: boolean }) {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Self-contained on purpose: the lobby's own state is a lot of moving
  // parts (party, queue, sockets), and this only needs two yes/no answers
  // that already have endpoints — asking directly avoids threading "does the
  // parent's loadout fetch happen to be done yet" through a prop.
  useEffect(() => {
    if (!signedIn) return;
    Promise.all([
      fetch("/api/loadout").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/onboarding").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([loadout, onboarding]) => {
      const hasLoadout = Boolean(
        loadout?.roleT || loadout?.roleCt ||
        Object.keys(loadout?.weapons?.T ?? {}).length ||
        Object.keys(loadout?.weapons?.CT ?? {}).length
      );
      if (!hasLoadout && onboarding && !onboarding.seenMatchmakingTutorial) {
        setActive(true);
      }
    });
  }, [signedIn]);

  const finish = useCallback(() => {
    setActive(false);
    fetch("/api/onboarding", { method: "PUT" }).catch(() => {});
  }, []);

  const current = STEPS[step];
  const rect = useSpotlightRect(active ? current?.target : undefined);

  if (!mounted || !active) return null;

  const t = (key: string) => TUTORIAL_TEXT[key] ?? key;

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="tw-scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={finish}
      >
        {rect && (
          <motion.div
            className="tw-cutout"
            initial={false}
            animate={{
              top: rect.top - 8,
              left: rect.left - 8,
              width: rect.width + 16,
              height: rect.height + 16,
            }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
        )}
      </motion.div>

      <motion.div
        key={step}
        className="tw-card"
        style={
          rect
            ? { top: Math.min(rect.bottom + 18, window.innerHeight - 220), left: Math.max(16, Math.min(rect.left, window.innerWidth - 340)) }
            : undefined
        }
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="tw-skip" onClick={finish} aria-label={t("tutorial.skip")}>
          <X size={16} />
        </button>
        <span className="tw-step-count">{step + 1} / {STEPS.length}</span>
        <h3>{t(current.titleKey)}</h3>
        <p>{t(current.bodyKey)}</p>
        <div className="tw-progress">
          {STEPS.map((_, i) => (
            <span key={i} className={`tw-dot ${i === step ? "on" : ""}`} />
          ))}
        </div>
        <div className="tw-nav">
          {step > 0 && (
            <button className="btn btn-ghost tw-back" onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft size={14} /> {t("tutorial.back")}
            </button>
          )}
          <button
            className="btn btn-primary tw-next"
            onClick={() => (step === STEPS.length - 1 ? finish() : setStep((s) => s + 1))}
          >
            {step === STEPS.length - 1 ? t("tutorial.done") : t("tutorial.next")}
            {step < STEPS.length - 1 && <ArrowRight size={14} />}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

// Inline rather than the i18n system: this only ever renders once per
// player, for a few seconds, and framer-motion's per-step key remount makes
// wiring a full locale round-trip more machinery than four short strings need.
const TUTORIAL_TEXT: Record<string, string> = {
  "tutorial.skip": "Skip",
  "tutorial.back": "Back",
  "tutorial.next": "Next",
  "tutorial.done": "Got it",
  "tutorial.welcome.title": "New here? Quick tour.",
  "tutorial.welcome.body": "Before you queue, pick a role and a starting loadout — takes under a minute, and your team can see it.",
  "tutorial.role.title": "Pick a role",
  "tutorial.role.body": "What you want to be doing when the team walks onto the site. One per side — T and CT are separate picks.",
  "tutorial.queue.title": "Queue when ready",
  "tutorial.queue.body": "This is where you'll actually find a match once your role and loadout are set.",
  "tutorial.loadout.title": "One more thing: your weapons",
  "tutorial.loadout.body": "The Loadout page (top nav) is where you set which gun you want on each buy round — the server actually reads that one.",
};
