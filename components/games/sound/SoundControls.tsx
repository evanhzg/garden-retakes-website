"use client";

import React, { useEffect, useState } from "react";
import { sound } from "./SoundManager";

// Speaker button + volume slider, synced to the shared SoundManager singleton.
export default function SoundControls() {
  const [{ volume, muted }, setState] = useState(() => sound.getState());
  const [open, setOpen] = useState(false);

  useEffect(() => sound.subscribe(setState), []);

  const icon = muted || volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊";

  return (
    <div
      className="mono-sound"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        className={`mono-sound-btn ${muted ? "muted" : ""}`}
        onClick={() => { sound.toggleMute(); sound.play("click"); }}
        title={muted ? "Unmute" : "Mute"}
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {icon}
      </button>
      <div className={`mono-sound-slider ${open ? "open" : ""}`}>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round((muted ? 0 : volume) * 100)}
          onChange={(e) => {
            const v = Number(e.target.value) / 100;
            if (muted && v > 0) sound.setMuted(false);
            sound.setVolume(v);
          }}
          onMouseUp={() => sound.play("click")}
          aria-label="Volume"
        />
      </div>
    </div>
  );
}
