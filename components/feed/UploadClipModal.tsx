"use client";

import { useEffect, useRef, useState } from "react";
import { youtubeId } from "@/lib/feedShared";

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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [youtube, setYoutube] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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

  return (
    <div className="pro-modal" role="dialog" aria-modal="true" aria-labelledby="post-clip" onClick={() => !busy && onClose()}>
      <div className="pro-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="pro-modal-head">
          <h2 id="post-clip">Post a clip</h2>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Close</button>
        </div>

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

          <div className="clip-or"><span>or</span></div>

          <div className="field">
            <label htmlFor="clip-yt">YouTube link</label>
            <input
              id="clip-yt"
              className="input"
              value={youtube}
              placeholder="https://youtube.com/watch?v=… or a Shorts link"
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
            <label htmlFor="clip-title">Title</label>
            <input id="clip-title" className="input" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="clip-desc">Description <span className="muted">(optional)</span></label>
            <textarea id="clip-desc" className="input" rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div aria-live="assertive" role="alert">
            {error && (
              <p className="skin-note skin-note-error"><span>{error}</span></p>
            )}
          </div>

          <details className="clip-help">
            <summary>Where do clips come from?</summary>
            <div className="clip-help-body">
              <p>
                <strong>Three ways, all end up here.</strong>
              </p>
              <ol>
                <li>
                  <strong>Drop a video above.</strong> MP4, WebM or MOV up to {MAX_MB} MB. Anything you
                  already have — Steam recordings, NVIDIA/AMD captures, a phone clip of the scoreboard.
                </li>
                <li>
                  <strong>Paste a YouTube link.</strong> Full links, <code>youtu.be</code> short links and
                  Shorts all work. Use this for anything longer than a highlight; it costs us no storage
                  and YouTube handles the streaming.
                </li>
                <li>
                  <strong>Automatic, from a demo.</strong> Run the <code>garden-highlights</code> pipeline
                  on your machine: drop <code>.dem</code> files into <code>demos/in</code>, run one
                  script, and every ace / 4K / 3K in them is detected, recorded with HLAE, encoded to
                  three qualities and posted here with a title. Ask an admin for the zip.
                </li>
              </ol>
              <p className="clip-help-note">
                Uploaded and pipeline clips play in our own player — quality switcher, scrubber and
                fullscreen. Click any clip in the feed to open it large.
              </p>
            </div>
          </details>

          <div className="clip-form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={!canPost || busy}>
              {busy ? "Posting…" : "Post clip"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
