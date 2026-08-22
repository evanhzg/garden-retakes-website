"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import RetakesIcon from "@/components/retakes/RetakesIcon";
import BundleCard from "@/components/retakes/BundleCard";
import {
  ROUND_KINDS,
  SLOT_FOR_ROUND,
  bundleById,
  bundlesFor,
  choicesFor,
  itemName,
  type BundleSelection,
  type RoundKind,
  type Side,
  type WeaponPrefs,
} from "@/lib/retakeLoadout";

const SIDES: Side[] = ["T", "CT"];

/**
 * The loadout, as a handful of answers per round type.
 *
 * What this replaces: eight weapon dropdowns — four slots times two sides —
 * offering every gun in the game, to say a thing almost everybody says the same
 * way. "A rifle and full util" was four separate clicks in two different
 * sections. It is one card now.
 *
 * The full list has not gone anywhere. It is behind one control per round type
 * and opens *over* the cards rather than replacing them — the same drawer the
 * inventory rebuild uses, for the same reason: the grid underneath stays
 * mounted, so closing is instant and nothing you were looking at moves.
 *
 * `round` renders one section instead of all three, which is how the lobby's
 * setup gate walks somebody through pistol, force and full one screen at a time
 * without a second copy of any of this.
 */
export default function BundlePicker({
  selection,
  weapons,
  weaponIcons = {},
  onPick,
  onWeapon,
  round,
}: {
  selection: BundleSelection;
  /** Guns chosen outside a bundle. They layer over it; the bundle still applies. */
  weapons: WeaponPrefs;
  /** Item id to icon URL, resolved on the server from the item catalog. */
  weaponIcons?: Record<number, string>;
  onPick: (side: Side, round: RoundKind, bundleId: string | null) => void;
  onWeapon: (side: Side, round: RoundKind, itemId: number | null) => void;
  round?: RoundKind;
}) {
  const { t } = useI18n();
  const [drawer, setDrawer] = useState<RoundKind | null>(null);

  const rounds = round ? [round] : ROUND_KINDS;

  /** unset → T → CT → both → unset, on one target. */
  const cycle = (kind: RoundKind, bundleId: string) => {
    const has = (side: Side) => selection[side]?.[kind] === bundleId;
    const canT = bundleById(bundleId)?.weapon.T !== undefined;

    if (!has("T") && !has("CT")) {
      // A CT-only bundle skips the T step rather than offering a state it
      // cannot enter and silently doing nothing.
      if (canT) onPick("T", kind, bundleId);
      else onPick("CT", kind, bundleId);
      return;
    }
    if (has("T") && !has("CT")) {
      onPick("T", kind, null);
      onPick("CT", kind, bundleId);
      return;
    }
    if (!has("T") && has("CT")) {
      if (canT) onPick("T", kind, bundleId);
      else {
        onPick("CT", kind, null);
      }
      return;
    }
    onPick("T", kind, null);
    onPick("CT", kind, null);
  };

  return (
    <div className="lo-bundles">
      {rounds.map((kind) => {
        const cards = bundlesFor(kind, "T")
          .concat(bundlesFor(kind, "CT"))
          .filter((b, i, a) => a.findIndex((x) => x.id === b.id) === i);

        const chosen = SIDES.filter((s) => selection[s]?.[kind]);
        const overrides = SIDES.filter((s) => weapons[s]?.[SLOT_FOR_ROUND[kind]] !== undefined);

        return (
          <section className="lo-bundle-round" key={kind}>
            <header className="lo-bundle-head">
              <div>
                <h3>
                  <RetakesIcon id={kind} size={18} />
                  {t(`loadout.round.${kind}`)}
                </h3>
                <p>{t(`loadout.round.${kind}.sub`)}</p>
              </div>
              <span
                className={`lo-bundle-status ${chosen.length === 2 ? "on" : ""}`}
                title={t("loadout.bundle.bothSides")}
              >
                {chosen.length === 2
                  ? t("loadout.bundle.set")
                  : t("loadout.bundle.missing", { n: 2 - chosen.length })}
              </span>
            </header>

            <div className="lo-bundle-grid">
              {cards.map((b) => (
                <BundleCard
                  key={b.id}
                  bundle={b}
                  sides={SIDES.filter((s) => selection[s]?.[kind] === b.id)}
                  onCycle={() => cycle(kind, b.id)}
                />
              ))}
            </div>

            <button
              type="button"
              className="lo-bundle-other"
              onClick={() => setDrawer(drawer === kind ? null : kind)}
              aria-expanded={drawer === kind}
            >
              {t("loadout.bundle.other")}
              {overrides.length > 0 && (
                <span className="lo-bundle-other-count">{overrides.length}</span>
              )}
            </button>

            <AnimatePresence>
              {drawer === kind && (
                <motion.div
                  className="lo-bundle-drawer"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                >
                  <div className="lo-bundle-drawer-head">
                    <h4>{t("loadout.bundle.otherTitle")}</h4>
                    <p>{t("loadout.bundle.otherHelp")}</p>
                    <button
                      type="button"
                      className="lo-bundle-drawer-close"
                      onClick={() => setDrawer(null)}
                      aria-label={t("loadout.bundle.otherClose")}
                    >
                      <X size={15} />
                    </button>
                  </div>

                  {SIDES.map((side) => {
                    const slot = SLOT_FOR_ROUND[kind];
                    const current = weapons[side]?.[slot];
                    return (
                      <div className={`lo-bundle-drawer-side side-${side}`} key={side}>
                        <span className="lo-bundle-drawer-label">{t(`loadout.side.${side}`)}</span>
                        <div className="lo-bundle-drawer-guns">
                          <button
                            type="button"
                            className={`lo-gun ${current === undefined ? "on" : ""}`}
                            onClick={() => onWeapon(side, kind, null)}
                          >
                            {t("loadout.bundle.otherNone")}
                          </button>
                          {choicesFor(slot, side).map((c) => (
                            <button
                              type="button"
                              key={c.id}
                              className={`lo-gun ${current === c.id ? "on" : ""}`}
                              onClick={() => onWeapon(side, kind, c.id)}
                            >
                              {weaponIcons[c.id] && (
                                <img src={weaponIcons[c.id]} alt="" loading="lazy" draggable={false} />
                              )}
                              {c.name}
                            </button>
                          ))}
                        </div>
                        {current !== undefined && (
                          <span className="lo-bundle-drawer-note">
                            {t("loadout.bundle.otherActive", { gun: itemName(current) ?? "" })}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        );
      })}
    </div>
  );
}
