"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// The clip player.
//
// Built rather than pulled in: video.js and Plyr both weigh more than this
// whole page and arrive with their own design language, which would have to be
// fought back into the site's. This is one <video> plus the controls actually
// needed — play/pause, a real scrubber, volume, quality, fullscreen — styled
// from the same tokens as everything else.
//
// Quality switching swaps the src and restores currentTime. That is the whole
// trick: three separate MP4s need no MediaSource plumbing, and every browser
// plays them natively. The cost is a reload on switch, which is imperceptible
// on a ten-second clip and is why the pipeline encodes with +faststart.

export type Variant = { name: string; height: number; url: string };

const QUALITY_KEY = "garden_clip_quality";

const fmt = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

export default function VideoPlayer({
  variants,
  poster,
  title,
  autoPlay = false,
  className = "",
}: {
  variants: Variant[];
  poster?: string | null;
  title?: string;
  autoPlay?: boolean;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | null>(null);

  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [waiting, setWaiting] = useState(false);

  // Remember the chosen quality across clips; fall back to the best available
  // when the stored one is not offered for this clip.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(QUALITY_KEY);
      const i = variants.findIndex((v) => v.name === saved);
      if (i >= 0) setCurrent(i);
    } catch {
      /* private mode */
    }
  }, [variants]);

  const active = variants[current] ?? variants[0];

  /** Swap rendition without losing the playhead or the play state. */
  const chooseQuality = (index: number) => {
    const video = videoRef.current;
    if (!video || index === current) return setQualityOpen(false);
    const at = video.currentTime;
    const wasPlaying = !video.paused;
    setCurrent(index);
    setQualityOpen(false);
    try {
      localStorage.setItem(QUALITY_KEY, variants[index].name);
    } catch {
      /* private mode */
    }
    // The <source> changes on re-render; restore position once it can seek.
    const restore = () => {
      video.currentTime = at;
      if (wasPlaying) video.play().catch(() => {});
      video.removeEventListener("loadedmetadata", restore);
    };
    video.addEventListener("loadedmetadata", restore);
    video.load();
  };

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  const seek = (fraction: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration)) return;
    v.currentTime = Math.min(v.duration, Math.max(0, fraction * v.duration));
  };

  const toggleFullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen().catch(() => {});
  };

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  /** Controls fade while playing and come back on any pointer movement. */
  const nudgeControls = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShowControls(false);
    }, 2200);
  }, []);

  useEffect(() => () => { if (hideTimer.current) window.clearTimeout(hideTimer.current); }, []);

  // Keyboard, scoped to the player so it never steals the page's keys.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const v = videoRef.current;
    if (!v) return;
    const k = e.key.toLowerCase();
    if (k === " " || k === "k") { e.preventDefault(); togglePlay(); }
    else if (k === "arrowright") { e.preventDefault(); v.currentTime += 5; }
    else if (k === "arrowleft") { e.preventDefault(); v.currentTime -= 5; }
    else if (k === "arrowup") { e.preventDefault(); v.volume = Math.min(1, v.volume + 0.1); }
    else if (k === "arrowdown") { e.preventDefault(); v.volume = Math.max(0, v.volume - 0.1); }
    else if (k === "m") { v.muted = !v.muted; }
    else if (k === "f") { toggleFullscreen(); }
    else return;
    nudgeControls();
  };

  if (!active) return null;

  const progress = duration > 0 ? time / duration : 0;

  return (
    <div
      ref={wrapRef}
      className={`vp ${fullscreen ? "is-fullscreen" : ""} ${showControls || !playing ? "show" : ""} ${className}`}
      onMouseMove={nudgeControls}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="group"
      aria-label={title ? `Video: ${title}` : "Video player"}
    >
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        className="vp-video"
        src={active.url}
        poster={poster ?? undefined}
        preload="metadata"
        playsInline
        autoPlay={autoPlay}
        onClick={togglePlay}
        onPlay={() => { setPlaying(true); nudgeControls(); }}
        onPause={() => { setPlaying(false); setShowControls(true); }}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onVolumeChange={(e) => { setVolume(e.currentTarget.volume); setMuted(e.currentTarget.muted); }}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onProgress={(e) => {
          const v = e.currentTarget;
          if (v.buffered.length && v.duration) setBuffered(v.buffered.end(v.buffered.length - 1) / v.duration);
        }}
        onEnded={() => setPlaying(false)}
      />

      {waiting && <div className="vp-spinner" aria-hidden />}

      {!playing && (
        <button className="vp-bigplay" onClick={togglePlay} aria-label="Play">
          <span aria-hidden>▶</span>
        </button>
      )}

      <div className="vp-controls">
        <Scrubber progress={progress} buffered={buffered} duration={duration} onSeek={seek} />

        <div className="vp-row">
          <button className="vp-btn" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
            {playing ? "❚❚" : "▶"}
          </button>

          <span className="vp-time num">
            {fmt(time)} <span className="vp-time-sep">/</span> {fmt(duration)}
          </span>

          <div className="vp-volume">
            <button
              className="vp-btn"
              onClick={() => { const v = videoRef.current; if (v) v.muted = !v.muted; }}
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted || volume === 0 ? "🔇" : "🔊"}
            </button>
            <label className="sr-only" htmlFor="vp-vol">Volume</label>
            <input
              id="vp-vol"
              className="vp-vol-slider"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => {
                const v = videoRef.current;
                if (!v) return;
                v.volume = Number(e.target.value);
                v.muted = Number(e.target.value) === 0;
              }}
            />
          </div>

          <div className="vp-spacer" />

          {variants.length > 1 && (
            <div className="vp-quality">
              <button
                className="vp-btn vp-quality-btn"
                onClick={() => setQualityOpen((v) => !v)}
                aria-expanded={qualityOpen}
                aria-haspopup="listbox"
              >
                {active.name}
              </button>
              {qualityOpen && (
                <ul className="vp-quality-menu" role="listbox" aria-label="Quality">
                  {variants.map((v, i) => (
                    <li key={v.name}>
                      <button
                        role="option"
                        aria-selected={i === current}
                        className={i === current ? "active" : ""}
                        onClick={() => chooseQuality(i)}
                      >
                        {v.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <button className="vp-btn" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}>
            {fullscreen ? "⤡" : "⤢"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Progress bar with buffered range, drag-to-seek and keyboard support. */
function Scrubber({
  progress,
  buffered,
  duration,
  onSeek,
}: {
  progress: number;
  buffered: number;
  duration: number;
  onSeek: (fraction: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const fractionFrom = (clientX: number) => {
    const el = ref.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };

  return (
    <div
      ref={ref}
      className="vp-scrub"
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration) || 0}
      aria-valuenow={Math.round(progress * duration) || 0}
      onPointerDown={(e) => {
        dragging.current = true;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        onSeek(fractionFrom(e.clientX));
      }}
      onPointerMove={(e) => dragging.current && onSeek(fractionFrom(e.clientX))}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") onSeek(Math.min(1, progress + 5 / (duration || 1)));
        if (e.key === "ArrowLeft") onSeek(Math.max(0, progress - 5 / (duration || 1)));
      }}
    >
      <div className="vp-scrub-track">
        <div className="vp-scrub-buffered" style={{ width: `${buffered * 100}%` }} />
        <div className="vp-scrub-played" style={{ width: `${progress * 100}%` }} />
        <div className="vp-scrub-handle" style={{ left: `${progress * 100}%` }} />
      </div>
    </div>
  );
}
