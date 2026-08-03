"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { youtubeId } from "@/lib/feedShared";
import { useI18n } from '@/components/I18nProvider';
import DemoUpload from "@/components/feed/DemoUpload";

// Posting a clip: drop a file or paste a YouTube link, in one dialog.
//
// Both routes share a single title/description form rather than living behind a
// mode switch — you pick a source and the rest is the same, so making people
// choose "upload or YouTube?" before showing them anything would be a step for
// nothing.

const MAX_MB = 100;

export default function UploadClipModal({
  onClose,
  onPosted,
}: {
  onClose: () => void;
  onPosted: () => void;
}) {
    const { t } = useI18n();

  // Two ways in: a finished clip, or a demo for the pipeline to cut.
  const [mode, setMode] = useState<"clip" | "demo">("clip");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [youtube, setYoutube] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Portalled to <body>, and the scroll lock goes on .main-content, which is
  // the scroll container here. Rendered in place this sat inside the feed
  // section, and an ancestor with a transform in its animation keyframes is the
  // containing block for position:fixed — so once the feed had enough clips to
  // scroll, the dialog anchored to the section instead of the viewport.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);

    const scroller = document.querySelector<HTMLElement>(".main-content");
    const previous = scroller?.style.overflow ?? "";
    if (scroller) scroller.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      if (scroller) scroller.style.overflow = previous;
    };
  }, [onClose, busy]);

  // Revoke the object URL when the chosen file changes or the dialog closes.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const ytId = youtube.trim() ? youtubeId(youtube) : null;
  const canPost = Boolean(title.trim()) && (Boolean(file) || Boolean(ytId));

  const choose = (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith("video/")) return setError("That is not a video file.");
    if (f.size > MAX_MB * 1024 * 1024) {
      return setError(`${(f.size / 1024 / 1024).toFixed(0)} MB is over the ${MAX_MB} MB limit — paste a YouTube link instead.`);
    }
    setError(null);
    setFile(f);
    setYoutube("");
    setPreview(URL.createObjectURL(f));
    // Give the title a sensible starting point from the filename.
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 140));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPost || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("title", title.trim());
      body.append("description", description.trim());
      if (file) body.append("file", file);
      else if (ytId) body.append("youtube", ytId);

      const res = await fetch("/api/feed", { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not post that.");
        return;
      }
      onPosted();
    } catch {
      setError("Upload failed — nothing was posted.");
    } finally {
      setBusy(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="pro-modal" role="dialog" aria-modal="true" aria-labelledby="post-clip" onClick={() => !busy && onClose()}>
      <div className="pro-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="pro-modal-head">
          <h2 id="post-clip">{mode === "clip" ? "Post a clip" : "Upload a demo"}</h2>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>{t("auto.uploadclipmodal.close")}</button>
        </div>

        <div className="pro-tabs" role="tablist" aria-label={t("auto.uploadclipmodal.what_are_you_posting")}>
          <button role="tab" aria-selected={mode === "clip"} className={`pro-tab ${mode === "clip" ? "active" : ""}`} onClick={() => setMode("clip")}>
            {t("auto.uploadclipmodal.a_clip")}
                                </button>
          <button role="tab" aria-selected={mode === "demo"} className={`pro-tab ${mode === "demo" ? "active" : ""}`} onClick={() => setMode("demo")}>
            {t("auto.uploadclipmodal.a_demo")}
                                </button>
        </div>

        {mode === "demo" ? (
          <div className="pro-panel">
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
              {t("auto.uploadclipmodal.upload_a_match_demo_and_the_hi")}
                                      </p>
            <DemoUpload onPosted={onPosted} />
          </div>
        ) : (
        <form onSubmit={submit} className="clip-form">
          <label
            className={`skin-drop${dragging ? " is-over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files?.[0] ?? null); }}
          >
            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              onChange={(e) => { choose(e.target.files?.[0] ?? null); e.target.value = ""; }}
            />
            <span className="skin-drop-title">{file ? file.name : "Drop a clip here, or choose a file"}</span>
            <span className="skin-drop-hint">
              {file
                ? `${(file.size / 1024 / 1024).toFixed(1)} MB — ready`
                : `MP4, WebM or MOV, up to ${MAX_MB} MB`}
            </span>
          </label>

          {preview && (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video className="clip-preview" src={preview} controls preload="metadata" playsInline />
          )}

          <div className="clip-or"><span>{t("auto.uploadclipmodal.or")}</span></div>

          <div className="field">
            <label htmlFor="clip-yt">{t("auto.uploadclipmodal.youtube_link")}</label>
            <input
              id="clip-yt"
              className="input"
              value={youtube}
              placeholder={t("auto.uploadclipmodal.https_youtube_com_watch_v_or_a")}
              onChange={(e) => {
                setYoutube(e.target.value);
                if (e.target.value.trim()) { setFile(null); setPreview(null); }
              }}
            />
            {youtube.trim() && (
              <p className="pro-settings-hint">
                {ytId ? `Video ${ytId} ✓` : "That link has no video id in it."}
              </p>
            )}
          </div>

          <div className="field">
            <label htmlFor="clip-title">{t("auto.uploadclipmodal.title")}</label>
            <input id="clip-title" className="input" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="clip-desc">{t("auto.uploadclipmodal.description")} <span className="muted">{t("auto.uploadclipmodal._optional")}</span></label>
            <textarea id="clip-desc" className="input" rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div aria-live="assertive" role="alert">
            {error && (
              <p className="skin-note skin-note-error"><span>{error}</span></p>
            )}
          </div>

          <details className="clip-help">
            <summary>{t("auto.uploadclipmodal.where_do_clips_come_from")}</summary>
            <div className="clip-help-body">
              <p>
                <strong>{t("auto.uploadclipmodal.three_ways_all_end_up_here")}</strong>
              </p>
              <ol>
                <li>
                  <strong>{t("auto.uploadclipmodal.drop_a_video_above")}</strong> {t("auto.uploadclipmodal.mp4_webm_or_mov_up_to")} {MAX_MB} {t("auto.uploadclipmodal.mb_anything_you_already_have_s")}
                                                          </li>
                <li>
                  <strong>{t("auto.uploadclipmodal.paste_a_youtube_link")}</strong> {t("auto.uploadclipmodal.full_links")} <code>{t("auto.uploadclipmodal.youtu_be")}</code> {t("auto.uploadclipmodal.short_links_and_shorts_all_wor")}
                                                          </li>
                <li>
                  <strong>{t("auto.uploadclipmodal.automatic_from_a_demo")}</strong> {t("auto.uploadclipmodal.run_the")} <code>{t("auto.uploadclipmodal.garden_highlights")}</code> {t("auto.uploadclipmodal.pipeline_on_your_machine_drop")} <code>{t("auto.uploadclipmodal.demos_in")}</code>{t("auto.uploadclipmodal._run_one_script_and_every_ace")} <code>{t("auto.uploadclipmodal._dem_gz")}</code>
                  {t("auto.uploadclipmodal.straight_from_faceit")} <code>{t("auto.uploadclipmodal._bz2")}</code>, <code>{t("auto.uploadclipmodal._zst")}</code> {t("auto.uploadclipmodal.or_a_plain_zip_are_all_unpacke")}
                                                          </li>
              </ol>
              <p className="clip-help-note">
                {t("auto.uploadclipmodal.uploaded_and_pipeline_clips_pl")}
                                                    </p>
            </div>
          </details>

          <div className="clip-form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>{t("auto.uploadclipmodal.cancel")}</button>
            <button type="submit" className="btn btn-primary" disabled={!canPost || busy}>
              {busy ? "Posting…" : "Post clip"}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>,
    document.body
  );
}
