"use client";

import { useI18n } from "@/components/I18nProvider";
import RetakesIcon from "@/components/retakes/RetakesIcon";

export type Modes = {
  sizes: { id: string; teamSize: number }[];
  size: string;
  premium: boolean;
  testing: boolean;
  premiumAvailable: boolean;
  botFillMs: number;
};

/**
 * What you are queueing for, at the foot of the lobby.
 *
 * Three buttons and two toggles, where there used to be three cards named after
 * queues — "Bot Training", "Classic Competitive", "Premium Competitive" — that
 * bundled the size into the name. Bot Training was the 2v2 and the other two
 * were 3v3, so choosing how many of you play and choosing who you play against
 * were the same click, and half the combinations had no button at all.
 *
 * Testing sits in the same row as the sizes because that is how it reads as a
 * mode, and it says which size it will run — "Testing · 3v3" — because it is a
 * modifier on whichever size is selected rather than a size of its own.
 *
 * Premium is a real button that changes on toggle rather than a checkbox. It is
 * off for a testing queue and says so: a lobby that fills with bots after
 * fifteen seconds has no rating band worth tightening.
 *
 * `inline` puts the sizes and the toggles on one line instead of two stacked
 * blocks. That is how the lobby uses it now — one row of options directly under
 * the queue button, which is where every lobby worth copying keeps them.
 */
export default function ModeBar({
  modes,
  canChange,
  partySize,
  safeQueue,
  onSafeQueue,
  onChange,
  inline,
}: {
  modes: Modes;
  canChange: boolean;
  partySize: number;
  safeQueue: boolean;
  onSafeQueue: (on: boolean) => void;
  onChange: (next: { size?: string; premium?: boolean; testing?: boolean }) => void;
  inline?: boolean;
}) {
  const { t } = useI18n();

  const sizeOf = (id: string) => modes.sizes.find((s) => s.id === id)?.teamSize ?? 0;
  const currentSize = sizeOf(modes.size);

  return (
    <div className={`rq-modes ${inline ? "inline" : ""}`}>
      <div className="rq-mode-row" role="group" aria-label={t("lobby.mode.label")}>
        {/* Testing first, as listed — it is the one you reach for to try the
            flow, and putting it after the sizes buried it. */}
        <button
          type="button"
          className={`rq-mode ${modes.testing ? "on testing" : ""}`}
          aria-pressed={modes.testing}
          disabled={!canChange}
          onClick={() => onChange({ testing: !modes.testing })}
        >
          <RetakesIcon id="testing" size={18} />
          <span className="rq-mode-name">{t("lobby.mode.testing")}</span>
          <span className="rq-mode-sub">
            {modes.testing
              ? t("lobby.mode.testingOn", { n: currentSize })
              : t("lobby.mode.testingSub")}
          </span>
        </button>

        {modes.sizes.map((s) => {
          const tooBig = partySize > s.teamSize;
          const on = modes.size === s.id;
          return (
            <button
              key={s.id}
              type="button"
              className={`rq-mode ${on ? "on" : ""}`}
              aria-pressed={on}
              disabled={!canChange || tooBig}
              onClick={() => onChange({ size: s.id })}
            >
              <span className="rq-mode-name big">{t("lobby.mode.vs", { n: s.teamSize })}</span>
              <span className="rq-mode-sub">
                {tooBig
                  ? t("lobby.partytoobig", { n: s.teamSize })
                  : t("lobby.mode.vsSub", { n: s.teamSize * 2 })}
              </span>
            </button>
          );
        })}
      </div>

      <div className="rq-mode-toggles">
        <button
          type="button"
          className={`rq-toggle premium ${modes.premium && !modes.testing ? "on" : ""}`}
          aria-pressed={modes.premium && !modes.testing}
          disabled={!canChange || !modes.premiumAvailable || modes.testing}
          title={
            modes.testing
              ? t("lobby.mode.premiumInTesting")
              : modes.premiumAvailable
                ? undefined
                : t("lobby.mode.premiumLocked")
          }
          onClick={() => onChange({ premium: !modes.premium })}
        >
          <RetakesIcon id="premium" size={16} />
          {t("lobby.mode.premium")}
        </button>

        <button
          type="button"
          className={`rq-toggle safe ${safeQueue ? "on" : ""}`}
          aria-pressed={safeQueue}
          disabled={!canChange}
          onClick={() => onSafeQueue(!safeQueue)}
        >
          <RetakesIcon id="anchor" size={16} />
          {t("lobby.mode.safe")}
        </button>
      </div>
    </div>
  );
}
