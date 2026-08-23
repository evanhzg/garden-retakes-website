"use client";

import { useI18n } from "@/components/I18nProvider";
import RetakesIcon from "@/components/retakes/RetakesIcon";
import type { Bundle, Side } from "@/lib/retakeLoadout";

/**
 * One answer to "what do you want handed to you", for one round type.
 *
 * The card is a single control that does two things, which is the point of it:
 * it says what you get, and the bubble in its corner says who you get it as.
 * The old page asked those separately — a side tab, then eight dropdowns
 * underneath it — so setting up a loadout meant visiting every section twice,
 * once per side, and most people want the same thing on both.
 *
 * Clicking opens the side menu; it does not cycle. Cycling made "both" — the
 * answer most people give — cost three clicks through two states they did not
 * mean, and nothing about a card that toggles says it has four positions. The
 * card is now a target that opens the same T / CT / Both menu the inventory
 * puts on a skin.
 *
 * A bundle no side can take is not rendered; a bundle only CT can take (the
 * ones with a defuse kit in them) renders with its T option disabled rather
 * than missing, because a card that silently refuses half its menu is worse
 * than one that says why.
 */
export default function BundleCard({
  bundle,
  sides,
  onOpen,
  open,
  disabled,
}: {
  bundle: Bundle;
  /** Which sides currently have this bundle selected. */
  sides: Side[];
  /** Hands back the card itself so the menu can be anchored to — and track — it. */
  onOpen: (el: HTMLElement) => void;
  open?: boolean;
  disabled?: boolean;
}) {
  const { t } = useI18n();

  const hasT = sides.includes("T");
  const hasCt = sides.includes("CT");
  const both = hasT && hasCt;
  const ctOnly = bundle.weapon.T === undefined;

  const state = both ? "both" : hasT ? "t" : hasCt ? "ct" : "none";

  const label = t(bundle.labelKey);
  const sideLabel = both
    ? `${t("loadout.side.T")} + ${t("loadout.side.CT")}`
    : hasT
      ? t("loadout.side.T")
      : hasCt
        ? t("loadout.side.CT")
        : t("loadout.bundle.unset");

  return (
    <button
      type="button"
      className={`lo-bundle lo-bundle-${state} ${open ? "open" : ""}`}
      onClick={(e) => onOpen(e.currentTarget)}
      disabled={disabled}
      aria-haspopup="menu"
      aria-expanded={Boolean(open)}
      // The colour carries the side, so the side has to be in the accessible
      // name too — otherwise a screen reader gets "Default + Kevlar" four
      // times and no way to tell which is which.
      aria-label={`${label} — ${sideLabel}`}
    >
      <span className="lo-bundle-bubble" aria-hidden="true">
        {state === "none" ? "" : both ? "T/CT" : hasT ? "T" : "CT"}
      </span>

      <span className="lo-bundle-name">{label}</span>

      <span className="lo-bundle-kit">
        {bundle.kevlar && (
          <RetakesIcon id="kevlar" size={16} title={t("loadout.bundle.has.kevlar")} />
        )}
        {bundle.kit && <RetakesIcon id="kit" size={16} title={t("loadout.bundle.has.kit")} />}
        {bundle.utility.map((u) => (
          <RetakesIcon key={u} id={u} size={16} title={t(`utility.type.${u}`)} />
        ))}
        {bundle.utility.length === 0 && !bundle.kevlar && !bundle.kit && (
          <span className="lo-bundle-bare">{t("loadout.bundle.has.nothing")}</span>
        )}
      </span>

      {ctOnly && <span className="lo-bundle-ctonly">{t("loadout.bundle.ctOnly")}</span>}
    </button>
  );
}
