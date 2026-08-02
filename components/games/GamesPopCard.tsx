"use client";

import { useEffect, useState } from "react";
import GardenPop, { defaultPopConfig, type GardenPopConfig } from "@/components/GardenPop";
import GardenPopEditor from "@/components/GardenPopEditor";

// The Garden-Pop avatar, relocated here from the CS2 profile hero.
//
// Same GardenPop / GardenPopEditor components and the same stored config
// (GardenWebProfiles.PopConfig via /api/profile) — only the home changed. It
// reads as a character on the games hub in a way it never did over a CS2
// scoreboard, and it is the piece slated for a proper pass later.

function parseConfig(raw: string | null): GardenPopConfig {
  if (!raw) return defaultPopConfig;
  try {
    const parsed = JSON.parse(raw);
    return {
      ...defaultPopConfig,
      ...parsed,
      hair: parsed.hair || defaultPopConfig.hair,
      stache: parsed.stache || defaultPopConfig.stache,
      color: parsed.color || defaultPopConfig.color,
      hairColor: parsed.hairColor || defaultPopConfig.hairColor,
    };
  } catch {
    return defaultPopConfig;
  }
}

export default function GamesPopCard({ initialPopConfig }: { initialPopConfig: string | null }) {
  const [config, setConfig] = useState<GardenPopConfig>(() => parseConfig(initialPopConfig));
  const [editing, setEditing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // three.js + the STL loader are heavy and strictly client-side; holding the
  // canvas back until after mount keeps it out of the first paint.
  useEffect(() => setMounted(true), []);

  const save = async (next: GardenPopConfig) => {
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ popConfig: JSON.stringify(next) }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Could not save your Pop.");
        return;
      }
      setConfig(next);
      setEditing(false);
    } catch {
      setError("Network error.");
    }
  };

  return (
    <div className="gprofile-pop">
      <div className="gprofile-pop-stage">
        {mounted ? (
          <GardenPop config={config} cameraDistance={17} enableZoom={false} />
        ) : (
          <div className="gprofile-pop-loading">Loading…</div>
        )}
      </div>
      <button type="button" className="gprofile-ghost" onClick={() => setEditing(true)}>
        Customise your Pop
      </button>
      {error && (
        <p role="alert" className="gprofile-pop-error">
          {error}
        </p>
      )}

      {editing && (
        <GardenPopEditor initialConfig={config} onSave={save} onCancel={() => setEditing(false)} />
      )}
    </div>
  );
}
