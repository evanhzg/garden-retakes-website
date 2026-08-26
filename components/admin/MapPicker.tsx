"use client";

import { useMemo, useState } from "react";
import { mapArt, mapLabel } from "@/lib/mapArt";
import "./mappicker.css";

// Choosing a map, visually.
//
// Both authoring tools did this differently and both did it badly: one had a
// <select> of ten names plus a second free-text field that only applied on
// blur, the other a grid with no search. Neither told you anything about the
// map you were choosing.
//
// A picture is the fastest way to recognise a map and the only way to recognise
// a workshop one whose file name says nothing. The `note` a caller passes is
// the thing that makes this an authoring control rather than decoration: on the
// spawn Maker it is how many spawns the map already has, which is precisely the
// question "which map should I work on next" is asking.

export type PickerMap = {
  name: string;
  label?: string;
  image?: string | null;
  /** A short line under the name — a count, a state, anything per-map. */
  note?: string;
  /** Draws the accent marker. Whatever "done" means to the caller. */
  ready?: boolean;
};

export default function MapPicker({
  maps,
  value,
  onChange,
  allowCustom = false,
  emptyHint = "No maps registered yet.",
}: {
  maps: PickerMap[];
  value: string;
  onChange: (map: string) => void;
  /** Adds a tile for typing a map name that is not in the list. */
  allowCustom?: boolean;
  emptyHint?: string;
}) {
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState("");
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  const needle = query.trim().toLowerCase();

  const shown = useMemo(
    () =>
      maps.filter(
        (m) =>
          !needle ||
          m.name.toLowerCase().includes(needle) ||
          (m.label ?? "").toLowerCase().includes(needle),
      ),
    [maps, needle],
  );

  // A map chosen through the custom field is not in the list, and a picker that
  // shows nothing selected while something is selected is the bug this avoids.
  const offList = value && !maps.some((m) => m.name === value);

  return (
    <div className="mp">
      <div className="mp-bar">
        <input
          className="mp-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter maps"
          aria-label="Filter maps"
        />

        {allowCustom && (
          <form
            className="mp-custom"
            onSubmit={(e) => {
              e.preventDefault();
              const name = custom.trim().toLowerCase();
              if (name) onChange(name);
            }}
          >
            <input
              className="mp-search"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Any other map name"
              aria-label="Any other map name"
            />
            {/* A button rather than onBlur: the old field only applied when you
                clicked away from it, so typing a name and pressing Enter did
                nothing and typing one and clicking a button applied it to the
                wrong map. */}
            <button className="btn btn-secondary mp-use" disabled={!custom.trim()}>
              Use
            </button>
          </form>
        )}
      </div>

      {offList && (
        <p className="mp-off">
          Editing <code>{value}</code>, which is not in the list.
        </p>
      )}

      {shown.length === 0 ? (
        <p className="empty-hint">{needle ? "No map matches that." : emptyHint}</p>
      ) : (
        <div className="mp-grid">
          {shown.map((m) => {
            const art = broken[m.name] ? null : mapArt(m.name, m.image);
            return (
              <button
                key={m.name}
                type="button"
                className={`mp-map ${value === m.name ? "on" : ""}`}
                onClick={() => onChange(m.name)}
                aria-pressed={value === m.name}
                title={m.name}
              >
                {art ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={art}
                    alt=""
                    loading="lazy"
                    onError={() => setBroken((b) => ({ ...b, [m.name]: true }))}
                  />
                ) : (
                  <span className="mp-blank" aria-hidden />
                )}

                <span className="mp-text">
                  <span className="mp-name">
                    {m.label || mapLabel(m.name)}
                    {m.ready && <span className="mp-ready" aria-hidden>●</span>}
                  </span>
                  <span className="mp-note">{m.note ?? m.name}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
