"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import RetakesIcon from "@/components/retakes/RetakesIcon";
import { MAX_EXCLUDED_MAPS, RETAKES_MAPS, mapImage, mapName, sanitiseExcludedMaps } from "@/lib/maps";

// The stylesheet travels with the component. It used to be imported only by
// the loadout page, so every one of these rendered unstyled inside the lobby
// — the first-run gate and the lobby's own map tab both mount it.
import "@/app/loadout/loadout.css";

/**
 * Maps you never want to be sent to.
 *
 * A preference rather than a veto, and the copy says so: both captains' lists
 * are honoured, so a fussier list takes longer to find a match instead of
 * quietly failing to. The matchmaker will not pair two parties whose remaining
 * maps are too few to run a veto on, and relaxes that with the wait — see
 * requiredPoolSize in scripts/retakesMatchmaking.js.
 *
 * The fifth drop is refused with a reason rather than ignored. A card that
 * silently does nothing when clicked is the version of this that gets reported
 * as broken.
 *
 * `value`/`onChange` make it controlled, which is how the lobby uses it — the
 * captain adjusts for one queue there and the change is not written back unless
 * they ask. Left uncontrolled, it loads and saves the account default itself,
 * which is how the loadout page uses it.
 *
 * `variant="row"` is the same control laid out as one scrolling strip, for the
 * lobby, where it is the last row under the queue button rather than a page of
 * its own. Same limit, same refusal, same state — a second component would have
 * been a second place for the cap to drift.
 */
export default function MapPreferences({
  value,
  onChange,
  onSave,
  busy,
  variant = "grid",
}: {
  value?: string[];
  onChange?: (excluded: string[]) => void;
  onSave?: (excluded: string[]) => void;
  busy?: boolean;
  variant?: "grid" | "row";
} = {}) {
  const { t } = useI18n();
  const controlled = value !== undefined;

  /** Null until the account's own list has loaded; unused when controlled. */
  const [own, setOwn] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const excluded = controlled ? sanitiseExcludedMaps(value) : (own ?? []);
  const loaded = controlled || own !== null;

  useEffect(() => {
    if (controlled) return;
    fetch("/api/loadout/maps")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setOwn(sanitiseExcludedMaps(d?.excluded)))
      .catch(() => setOwn([]));
  }, [controlled]);

  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(timer);
  }, [note]);

  const atLimit = excluded.length >= MAX_EXCLUDED_MAPS;

  function toggle(map: string) {
    const dropping = !excluded.includes(map);
    if (dropping && atLimit) {
      setNote({ kind: "err", text: t("loadout.maps.atLimit", { max: MAX_EXCLUDED_MAPS }) });
      return;
    }

    const next = dropping ? [...excluded, map] : excluded.filter((m) => m !== map);
    const cleaned = sanitiseExcludedMaps(next);

    if (controlled) onChange?.(cleaned);
    else void persist(cleaned);
  }

  async function persist(next: string[]) {
    setOwn(next);
    setSaving(true);
    try {
      const res = await fetch("/api/loadout/maps", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ excluded: next }),
      });
      if (!res.ok) throw new Error();
      setNote({ kind: "ok", text: t("loadout.maps.saved") });
    } catch {
      setNote({ kind: "err", text: t("loadout.maps.savefailed") });
    } finally {
      setSaving(false);
    }
  }

  const row = variant === "row";

  return (
    <div className={`lo-maps ${row ? "lo-maps-inline" : ""}`}>
      {row ? (
        <div className="lo-maps-rowhead">
          <span className="lo-maps-count">
            <RetakesIcon id="maps" size={14} />
            {t("loadout.maps.remaining", { n: excluded.length, max: MAX_EXCLUDED_MAPS })}
          </span>
          <span className="lo-maps-rowhint">{t("loadout.maps.rowHelp")}</span>
        </div>
      ) : (
        <>
          <p className="lo-hint">{t("loadout.maps.help", { max: MAX_EXCLUDED_MAPS })}</p>

          <div className="lo-maps-count">
            <RetakesIcon id="maps" size={15} />
            {t("loadout.maps.remaining", { n: excluded.length, max: MAX_EXCLUDED_MAPS })}
          </div>
        </>
      )}

      <div className={row ? "lo-maps-row" : "lo-maps-grid"} aria-busy={!loaded || saving || busy}>
        {RETAKES_MAPS.map((map) => {
          const dropped = excluded.includes(map);
          return (
            <button
              type="button"
              key={map}
              className={`lo-map ${dropped ? "dropped" : ""}`}
              onClick={() => toggle(map)}
              aria-pressed={dropped}
              // The picture is decorative — the name below it is the label —
              // so the button says which map and what state it is in, once.
              aria-label={`${mapName(map)}${dropped ? ` — ${t("loadout.maps.dropped")}` : ""}`}
            >
              <img src={mapImage(map)} alt="" loading="lazy" draggable={false} />
              <span className="lo-map-name">{mapName(map)}</span>
              {dropped && (
                <span className="lo-map-dropped">
                  <RetakesIcon id="ban" size={row ? 16 : 22} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {onSave && (
        <div className="lo-maps-save">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onSave(excluded)}
            disabled={busy}
          >
            {t("loadout.maps.save")}
          </button>
        </div>
      )}

      {note && <span className={`lo-note ${note.kind}`}>{note.text}</span>}
    </div>
  );
}
