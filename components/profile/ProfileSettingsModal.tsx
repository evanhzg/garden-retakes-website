"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MotionToggle from "@/components/MotionToggle";
import ConnectionsEditor from "@/components/profile/Connections";
import AppearanceSettings from "@/components/profile/AppearanceSettings";

// Profile settings, moved out of a panel at the very bottom of the page into a
// modal reachable from the hero. The old form was a vertical list of unrelated
// fields — name, then a raw avatar URL box, then bio, then country — which made
// "change my avatar" a scroll-and-hunt job and required hosting the image
// somewhere yourself first.
//
// Now: two centred columns, a live preview, and an import-then-crop flow so a
// picture off your disk becomes a square avatar without leaving the page.

type ProfileData = {
  steamId: string;
  steamName: string | null;
  steamAvatar: string | null;
  nameOverride: string | null;
  avatarUrl: string | null;
  bio: string | null;
  country: string | null;
};

const BIO_MAX = 280;
/** Output size of the cropper. Square, and small enough to stay well under 1 MB. */
const AVATAR_SIZE = 256;

export default function ProfileSettingsModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<ProfileData | null>(null);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [country, setCountry] = useState("");
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "ok" | "error"; message?: string }>({ kind: "idle" });
  const [cropping, setCropping] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d: ProfileData) => {
        setData(d);
        setName(d.nameOverride ?? "");
        setBio(d.bio ?? "");
        setCountry(d.country ?? "");
        setAvatarPreview(d.avatarUrl ?? d.steamAvatar ?? null);
      })
      .catch(() => setStatus({ kind: "error", message: "Could not load your profile." }));
  }, []);

  // Escape closes, and focus is parked inside the dialog on open.
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !cropping) onClose();
    };
    window.addEventListener("keydown", onKey);
    cardRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, cropping]);

  const save = async (payload: Record<string, unknown>) => {
    setStatus({ kind: "saving" });
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({ kind: "error", message: json.error ?? "Save failed." });
        return false;
      }
      setStatus({ kind: "ok", message: "Saved." });
      return true;
    } catch {
      setStatus({ kind: "error", message: "Network error." });
      return false;
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await save({ name: name.trim() === "" ? undefined : name, bio, country });
  };

  const onPickFile = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus({ kind: "error", message: "Pick an image file." });
      return;
    }
    setStatus({ kind: "idle" });
    setCropping(URL.createObjectURL(file));
  };

  const onCropped = async (blob: Blob) => {
    setCropping(null);
    setStatus({ kind: "saving" });
    const body = new FormData();
    body.append("avatar", blob, "avatar.png");
    try {
      const res = await fetch("/api/profile/avatar", { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({ kind: "error", message: json.error ?? "Upload failed." });
        return;
      }
      setAvatarPreview(json.url);
      setStatus({ kind: "ok", message: "Avatar updated." });
    } catch {
      setStatus({ kind: "error", message: "Network error." });
    }
  };

  const removeAvatar = async () => {
    setStatus({ kind: "saving" });
    const res = await fetch("/api/profile/avatar", { method: "DELETE" });
    if (res.ok) {
      setAvatarPreview(data?.steamAvatar ?? null);
      setStatus({ kind: "ok", message: "Back to your Steam avatar." });
    } else {
      setStatus({ kind: "error", message: "Could not remove it." });
    }
  };

  const revertName = async () => {
    if (await save({ revertName: true, bio, country })) {
      setName("");
      setData((d) => (d ? { ...d, nameOverride: null } : d));
    }
  };

  return (
    <div className="pro-modal" role="dialog" aria-modal="true" aria-labelledby="pro-settings-title" onClick={onClose}>
      <div className="pro-modal-card" ref={cardRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="pro-modal-head">
          <h2 id="pro-settings-title">Profile settings</h2>
          <button className="btn btn-secondary" onClick={onClose} aria-label="Close settings">Close</button>
        </div>

        {!data ? (
          <p className="muted">Loading your profile…</p>
        ) : (
          <>
          <form className="pro-settings" onSubmit={onSubmit}>
            <div className="pro-settings-avatar">
              <div className="pro-settings-avatar-frame">
                {avatarPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarPreview} alt="Your avatar" />
                ) : (
                  <span className="pro-settings-avatar-none" aria-hidden />
                )}
              </div>
              <label className="btn btn-secondary pro-settings-file">
                Import image
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    onPickFile(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </label>
              {data.avatarUrl && (
                <button type="button" className="btn btn-ghost" onClick={removeAvatar}>
                  Use my Steam avatar
                </button>
              )}
              <p className="pro-settings-hint">Cropped to a square, {AVATAR_SIZE}×{AVATAR_SIZE}.</p>
            </div>

            <div className="pro-settings-fields">
              <div className="field">
                <label htmlFor="set-name">Display name</label>
                <input
                  id="set-name"
                  className="input"
                  value={name}
                  maxLength={32}
                  placeholder={data.steamName ?? "Your Steam name"}
                  onChange={(e) => setName(e.target.value)}
                />
                <p className="pro-settings-hint">
                  Shown in-game and on the ladder. Leave blank to use your Steam name.
                </p>
              </div>

              <div className="field">
                <label htmlFor="set-country">Country</label>
                <input
                  id="set-country"
                  className="input"
                  value={country}
                  maxLength={2}
                  placeholder="FR"
                  style={{ maxWidth: 100, textTransform: "uppercase" }}
                  onChange={(e) => setCountry(e.target.value.toUpperCase())}
                />
              </div>

              <div className="field">
                <label htmlFor="set-bio">Bio</label>
                <textarea
                  id="set-bio"
                  className="input"
                  value={bio}
                  maxLength={BIO_MAX}
                  rows={4}
                  onChange={(e) => setBio(e.target.value)}
                />
                <p className="pro-settings-hint">
                  {bio.length}/{BIO_MAX}
                </p>
              </div>

              <MotionToggle />

              <div className="pro-settings-actions">
                <button className="btn btn-primary" type="submit" disabled={status.kind === "saving"}>
                  {status.kind === "saving" ? "Saving…" : "Save changes"}
                </button>
                {data.nameOverride && (
                  <button type="button" className="btn btn-secondary" onClick={revertName}>
                    Reset name
                  </button>
                )}
              </div>

              <div aria-live="polite">
                {status.message && (
                  <p className={`skin-note ${status.kind === "error" ? "skin-note-error" : "skin-note-ok"}`}>
                    <span>{status.message}</span>
                  </p>
                )}
              </div>
            </div>
          </form>

          {/* Connections save on their own — they are a different shape of data
              and a different request, and folding them into this form would tie
              a handle change to an avatar upload. */}
          <AppearanceSettings />

          <section className="pro-settings-conn">
            <h3>Connections</h3>
            <ConnectionsEditor />
          </section>
          </>
        )}
      </div>

      {cropping && (
        <AvatarCropper
          src={cropping}
          onCancel={() => {
            URL.revokeObjectURL(cropping);
            setCropping(null);
          }}
          onDone={onCropped}
        />
      )}
    </div>
  );
}

/**
 * Square cropper. Drag to pan, slider to zoom; the visible circle is exactly
 * what gets written, so what you frame is what you get. Canvas only — no
 * dependency, and the upload leaves the browser already cropped.
 */
function AvatarCropper({
  src,
  onCancel,
  onDone,
}: {
  src: string;
  onCancel: () => void;
  onDone: (blob: Blob) => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const STAGE = 300;

  useEffect(() => {
    const image = new Image();
    image.onload = () => setImg(image);
    image.src = src;
  }, [src]);

  // Scale that makes the image exactly cover the square at zoom 1, so there is
  // never a transparent gap inside the crop.
  const baseScale = img ? Math.max(STAGE / img.width, STAGE / img.height) : 1;

  const draw = useCallback(
    (canvas: HTMLCanvasElement, size: number) => {
      if (!img) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const ratio = size / STAGE;
      const scale = baseScale * zoom * ratio;
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, (size - w) / 2 + offset.x * ratio, (size - h) / 2 + offset.y * ratio, w, h);
    },
    [img, baseScale, zoom, offset]
  );

  useEffect(() => {
    if (canvasRef.current) draw(canvasRef.current, STAGE);
  }, [draw]);

  const commit = () => {
    const out = document.createElement("canvas");
    out.width = AVATAR_SIZE;
    out.height = AVATAR_SIZE;
    draw(out, AVATAR_SIZE);
    out.toBlob((blob) => blob && onDone(blob), "image/png");
  };

  return (
    <div className="pro-modal pro-modal-over" role="dialog" aria-modal="true" aria-label="Crop your avatar" onClick={onCancel}>
      <div className="pro-modal-card pro-crop-card" onClick={(e) => e.stopPropagation()}>
        <h2>Crop your avatar</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Drag to reposition, slide to zoom.</p>

        <div
          className="pro-crop-stage"
          onPointerDown={(e) => {
            dragging.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!dragging.current) return;
            setOffset({ x: e.clientX - dragging.current.x, y: e.clientY - dragging.current.y });
          }}
          onPointerUp={() => (dragging.current = null)}
          onPointerLeave={() => (dragging.current = null)}
        >
          <canvas ref={canvasRef} width={STAGE} height={STAGE} />
          <div className="pro-crop-mask" aria-hidden />
        </div>

        <label className="pro-crop-zoom">
          Zoom
          <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
        </label>

        <div className="pro-crop-actions">
          <button className="btn btn-secondary" type="button" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" type="button" onClick={commit} disabled={!img}>
            Use this
          </button>
        </div>
      </div>
    </div>
  );
}
