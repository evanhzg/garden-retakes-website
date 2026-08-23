"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import RetakesIcon from "@/components/retakes/RetakesIcon";
import BundleCard from "@/components/retakes/BundleCard";
import SideBubble, { type SideChoice } from "@/components/retakes/SideBubble";
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

// The stylesheet travels with the component. It used to be imported only by
// the loadout page, so every one of these rendered unstyled inside the lobby
// — the first-run gate and the lobby's own map tab both mount it.
import "@/app/loadout/loadout.css";

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
 * without a second copy of any of this. The gate is not a second design — it is
 * this component with one section showing, which is the only way the two stay
 * identical without anybody remembering to keep them so.
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
  /** The card whose side menu is open, and the element to hang it off. */
  const [menu, setMenu] = useState<{ kind: RoundKind; bundleId: string; el: HTMLElement } | null>(null);

  const rounds = round ? [round] : ROUND_KINDS;

  /** Which sides a card currently holds, as the menu states it. */
  const choiceOf = (kind: RoundKind, bundleId: string): SideChoice => {
    const hasT = selection.T?.[kind] === bundleId;
    const hasCt = selection.CT?.[kind] === bundleId;
    if (hasT && hasCt) return "both";
    if (hasT) return "T";
    if (hasCt) return "CT";
    return null;
  };

  /**
   * Set a card to exactly the sides picked, rather than nudging it one step on.
   *
   * Every side is written on every pick, including the ones being taken away:
   * choosing T on a card that was on both has to clear CT, or the menu would
   * say T while the card stayed split. A side landing on this card also leaves
   * whichever card had it, which the data model does for free — one bundle per
   * side per round.
   */
  const apply = (kind: RoundKind, bundleId: string, choice: SideChoice) => {
    const wantT = choice === "T" || choice === "both";
    const wantCt = choice === "CT" || choice === "both";
    const held = choiceOf(kind, bundleId);
    const hadT = held === "T" || held === "both";
    const hadCt = held === "CT" || held === "both";

    if (wantT !== hadT) onPick("T", kind, wantT ? bundleId : null);
    if (wantCt !== hadCt) onPick("CT", kind, wantCt ? bundleId : null);
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
                  open={menu?.kind === kind && menu?.bundleId === b.id}
                  onOpen={(el) =>
                    setMenu((m) =>
                      m?.kind === kind && m?.bundleId === b.id ? null : { kind, bundleId: b.id, el }
                    )
                  }
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

      {menu && (
        <SideBubble
          anchor={menu.el}
          value={choiceOf(menu.kind, menu.bundleId)}
          title={t(bundleById(menu.bundleId)?.labelKey ?? "")}
          subtitle={t(`loadout.round.${menu.kind}`)}
          allowT={bundleById(menu.bundleId)?.weapon.T !== undefined}
          allowCt={bundleById(menu.bundleId)?.weapon.CT !== undefined}
          onPick={(choice) => apply(menu.kind, menu.bundleId, choice)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
