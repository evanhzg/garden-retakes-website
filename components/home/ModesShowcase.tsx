import { GAME_MODES, type GameModeId } from "@/lib/gameModes";
import { getT } from '@/lib/serverI18n';

// What the plugin can turn the server into, on the homepage.
//
// The list itself lives in lib/gameModes because the admin panel needs the same
// ten ids, and its `hint` is written for an admin choosing from a dropdown:
// short, literal, and no help at all to someone deciding whether tonight is
// worth joining. So this is a second layer over the same data — a line of prose
// per mode for the visitor, with the original hint kept underneath as the
// factual one. Two sources would drift; one source with two voices does not.
//
// No client boundary: nothing here reacts to anything, and a section that
// exists to be read on first paint should not cost a hydration payload.

type Presentation = {
  /** Dictionary key; the copy itself lives in locales so it can be translated. */
  lineKey: string;
  // Marks are plain Unicode from the Geometric Shapes and Dingbats blocks
  // rather than an icon set, because a strict CSP blocks external requests and
  // an icon library would be several kilobytes of JavaScript for ten glyphs.
  // These particular code points ship with the system fonts on every platform
  // we see in analytics, so none of them fall back to tofu.
  glyph: string;
  // Absent means a small tile. Sizes are assigned by how much of the server's
  // week a mode actually accounts for, not by its position in the list, so the
  // grid reads as a ranking rather than as decoration.
  size?: "feature" | "wide";
};

const PRESENTATION: Partial<Record<GameModeId, Presentation>> = {
  retakes: {
    lineKey: "home.modes.retakes",
    glyph: "◎",
    size: "feature",
  },
  practice: {
    lineKey: "home.modes.practice",
    glyph: "◇",
    size: "wide",
  },
  executes: { lineKey: "home.modes.executes", glyph: "▷" },
  duels: { lineKey: "home.modes.duels", glyph: "✕" },
  spelltakers: {
    lineKey: "home.modes.spelltakers",
    glyph: "✦",
    size: "wide",
  },
  wingman: { lineKey: "home.modes.wingman", glyph: "◫" },
  faststrat: { lineKey: "home.modes.faststrat", glyph: "≫" },
  defender: { lineKey: "home.modes.defender", glyph: "▣" },
  hideandseek: {
    lineKey: "home.modes.hideandseek",
    glyph: "◐",
    size: "wide",
  },
  edit: { lineKey: "home.modes.edit", glyph: "✎" },
};

// Display order rather than list order: the spans above only tile the
// four-column grid without holes in this sequence, and a hole in a grid of ten
// looks like a bug rather than a choice.
const ORDER: readonly GameModeId[] = [
  "retakes",
  "practice",
  "executes",
  "duels",
  "spelltakers",
  "wingman",
  "faststrat",
  "defender",
  "hideandseek",
  "edit",
];

const rankOf = (id: GameModeId) => {
  const i = ORDER.indexOf(id);
  // An id nobody has ordered yet sorts to the end, where it joins the small
  // tiles instead of disappearing.
  return i === -1 ? ORDER.length : i;
};

export default function ModesShowcase() {
    const t = getT();

  // Driven by GAME_MODES, not by ORDER, so a mode added to the plugin appears
  // here the moment it is added to the shared list — before anyone has written
  // marketing copy for it, with its hint doing both jobs in the meantime.
  const tiles = [...GAME_MODES]
    .sort((a, b) => rankOf(a.id) - rankOf(b.id))
    .map((mode) => {
      const p = PRESENTATION[mode.id];
      return {
        id: mode.id,
        label: mode.label,
        hint: mode.hint,
        line: p?.lineKey ? t(p.lineKey) : "",
        glyph: p?.glyph ?? "◆",
        size: p?.size,
      };
    });

  return (
    <section className="modes-section" aria-labelledby="modes-heading">
      <div className="modes-head">
        <span className="kicker">{t("auto.modesshowcase.game_modes")}</span>
        <h2 className="modes-title" id="modes-heading">
          {t("auto.modesshowcase.ways_to_play")}
                          </h2>
        <p className="modes-intro">
          {t("auto.modesshowcase.all")} {GAME_MODES.length} {t("auto.modesshowcase.modes_the_plugin_ships_switche")}
                          </p>
      </div>

      <div className="modes-grid">
        {tiles.map((tile) => (
          <article
            key={tile.id}
            className={
              tile.size === "feature"
                ? "modes-tile modes-tile-feature"
                : tile.size === "wide"
                  ? "modes-tile modes-tile-wide"
                  : "modes-tile"
            }
          >
            {/* Decorative: the mark restates the label at best, and a screen
                reader announcing "black circle" before every mode name would be
                ten pieces of noise. */}
            <span className="modes-glyph" aria-hidden>
              {tile.glyph}
            </span>
            <h3 className="modes-label">{tile.label}</h3>
            <p className="modes-line">{tile.line || tile.hint}</p>
            {/* Suppressed when the hint is already carrying the main line, so a
                mode without copy shows its one sentence once rather than twice. */}
            {tile.line ? <p className="modes-hint">{tile.hint}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
