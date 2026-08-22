"use client";

import { useI18n } from "@/components/I18nProvider";
import RetakesIcon from "@/components/retakes/RetakesIcon";

export type LobbyTab = "play" | "loadout" | "maps" | "matches" | "live";

/**
 * The matchmaking rail.
 *
 * What it replaces: two ad-hoc buttons above the page ("Lobby", "Live Games",
 * inline-styled, no tablist, no keyboard semantics) and a third of the width
 * given over to a static card that listed the four steps of matchmaking and
 * three links out to other pages. The card described the thing it was sitting
 * next to; the links went to pages that are now tabs on this one.
 *
 * The pattern is the inventory rebuild's weapon-type rail — icon at rest, name,
 * a count on the right — because it is the one this site already has and the
 * one people here have already learned. It is a real tablist, unlike either of
 * the things it replaces.
 *
 * `badge` is the number that belongs on a row and null when there is nothing to
 * say. A zero is a fact worth showing on Matches (you have played none) and
 * noise on Live (nothing is on), so the caller decides, not this.
 */
export default function LobbyRail({
  tab,
  onTab,
  badges,
  locked,
}: {
  tab: LobbyTab;
  onTab: (tab: LobbyTab) => void;
  badges?: Partial<Record<LobbyTab, number | string | null>>;
  /** Tabs that cannot be opened yet, and why — the loadout gate uses this. */
  locked?: Partial<Record<LobbyTab, string>>;
}) {
  const { t } = useI18n();

  const rows: { id: LobbyTab; glyph: string }[] = [
    { id: "play", glyph: "play" },
    { id: "loadout", glyph: "loadout" },
    { id: "maps", glyph: "maps" },
    { id: "matches", glyph: "matches" },
    { id: "live", glyph: "live" },
  ];

  return (
    <nav className="rq-rail" role="tablist" aria-label={t("lobby.rail.label")}>
      {rows.map(({ id, glyph }) => {
        const badge = badges?.[id];
        const lock = locked?.[id];
        return (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            aria-disabled={Boolean(lock)}
            title={lock ?? undefined}
            className={`rq-rail-row ${tab === id ? "on" : ""} ${lock ? "locked" : ""}`}
            onClick={() => !lock && onTab(id)}
          >
            <RetakesIcon id={glyph} size={18} className="rq-rail-icon" />
            <span className="rq-rail-name">{t(`lobby.rail.${id}`)}</span>
            {badge !== null && badge !== undefined && (
              <span className="rq-rail-count">{badge}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
