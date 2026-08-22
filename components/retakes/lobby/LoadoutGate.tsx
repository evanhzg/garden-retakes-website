"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import BundlePicker from "@/components/retakes/BundlePicker";
import RetakesIcon from "@/components/retakes/RetakesIcon";
import {
  ROUND_KINDS,
  selectionComplete,
  type BundleSelection,
  type RoundKind,
  type Side,
  type WeaponPrefs,
} from "@/lib/retakeLoadout";

/**
 * The loadout, asked for once, before anybody queues.
 *
 * Everyone sees this the first time: CompletedRetakeSetup defaults false, so
 * the flag says "not yet" for every account that existed before the picker did.
 * That is the intent rather than a migration oversight — the options it writes
 * did not exist, so nobody has answered this question yet.
 *
 * One round type per step, because three grids at once is the page it replaced.
 * Closable, because being trapped on a settings screen to look at your own
 * lobby is worse than an unanswered question — but Play stays disabled until
 * every round type has both sides, and the server refuses the queue as well.
 * A disabled button is a courtesy; the gate is in rq:queue:join.
 */
export default function LoadoutGate({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [selection, setSelection] = useState<BundleSelection>({});
  const [weapons, setWeapons] = useState<WeaponPrefs>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/loadout")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setSelection(d.bundles ?? {});
          setWeapons(d.weapons ?? {});
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const round = ROUND_KINDS[step];
  const last = step === ROUND_KINDS.length - 1;

  /** This step is answered when both sides have taken something. */
  const stepDone = (["T", "CT"] as Side[]).every((s) => Boolean(selection[s]?.[round]));
  const allDone = selectionComplete(selection);

  const pick = (side: Side, kind: RoundKind, bundleId: string | null) =>
    setSelection((prev) => {
      const forSide = { ...(prev[side] ?? {}) };
      if (bundleId) forSide[kind] = bundleId;
      else delete forSide[kind];
      return { ...prev, [side]: forSide };
    });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/loadout", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bundles: selection, weapons }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error);
      // `complete` is decided by the server from what it actually stored, not
      // by this screen from what it thinks it sent.
      if (json.complete) onDone();
      else setError(t("lobby.gate.incomplete"));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("loadout.savefailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rq-setup-scrim">
      <motion.div
        className="rq-setup"
        initial={{ opacity: 0, y: 14, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
      >
        <header className="rq-setup-head">
          <div>
            <span className="rq-setup-kicker">{t("lobby.gate.kicker")}</span>
            <h2>{t("lobby.gate.title")}</h2>
            <p className="muted">{t("lobby.gate.blurb")}</p>
          </div>
          <button className="rq-setup-close" onClick={onClose} aria-label={t("lobby.gate.close")}>
            <X size={16} />
          </button>
        </header>

        <ol className="rq-setup-steps">
          {ROUND_KINDS.map((kind, i) => {
            const done = (["T", "CT"] as Side[]).every((s) => Boolean(selection[s]?.[kind]));
            return (
              <li key={kind} className={`${i === step ? "on" : ""} ${done ? "done" : ""}`}>
                <button type="button" onClick={() => setStep(i)}>
                  <RetakesIcon id={done ? "pick" : kind} size={15} />
                  {t(`loadout.round.${kind}`)}
                </button>
              </li>
            );
          })}
        </ol>

        <div className="rq-setup-body">
          {!loaded ? (
            <p className="muted rq-empty">{t("loadout.loading")}</p>
          ) : (
            <BundlePicker
              selection={selection}
              weapons={weapons}
              round={round}
              onPick={pick}
              onWeapon={(side, kind, itemId) =>
                setWeapons((prev) => {
                  const slot = kind === "pistol" ? "PistolRound" : kind === "half" ? "HalfBuyPrimary" : "FullBuyPrimary";
                  const forSide = { ...(prev[side] ?? {}) };
                  if (itemId === null) delete forSide[slot];
                  else forSide[slot] = itemId;
                  return { ...prev, [side]: forSide };
                })
              }
            />
          )}
        </div>

        {error && <p className="rq-setup-error">{error}</p>}

        <footer className="rq-setup-foot">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            {t("lobby.gate.back")}
          </button>

          {last ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!allDone || saving}
              onClick={save}
            >
              {saving ? t("loadout.saving") : t("lobby.gate.finish")}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!stepDone}
              onClick={() => setStep((s) => s + 1)}
            >
              {t("lobby.gate.next")}
            </button>
          )}
        </footer>
      </motion.div>
    </div>
  );
}
