"use client";

import Link from "next/link";
import { useState } from "react";
import AvatarImage from "@/components/AvatarImage";
import ClipModal from "@/components/feed/ClipModal";
import ClipEditor from "@/components/feed/ClipEditor";
import ShareMenu from "@/components/feed/ShareMenu";
import type { Variant } from "@/components/feed/VideoPlayer";

export type Clip = {
  id: number;
  steamId: string;
  author: string;
  /** False when the player has no profile here — shown, but not linked. */
  authorIsUser?: boolean;
  avatar?: string;
  title: string;
  description: string | null;
  kind: string;
  source: string;
  thumb: string | null;
  createdAt: string;
  /** JSON array of renditions for R2-hosted clips. */
  variants?: string | null;
  durationSec?: number | null;
  likes: number;
  comments: number;
  likedByMe: boolean;
  mine: boolean;
  canEdit?: boolean;
};

type Comment = {
  id: number;
  steamId: string;
  author: string;
  /** False when the player has no profile here — shown, but not linked. */
  authorIsUser?: boolean;
  avatar?: string;
  body: string;
  at: string;
  mine: boolean;
};

/**
 * Cards live in a grid, so a clip with no description was a whole line shorter
 * than its neighbours. Rather than filler text, say something true about where
 * the clip came from — the pipeline already writes "Round N - map" for its own,
 * so this only ever shows for hand-posted clips.
 */
const describeFallback = (clip: Clip): string => {
  if (clip.kind === "youtube") return "Shared from YouTube";
  if (clip.kind === "r2") return "Server highlight";
  return "Community clip";
};

const ago = (iso: string) => {
  const s = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
  const units: [number, string][] = [
    [60, "s"],
    [3600, "m"],
    [86400, "h"],
    [604800, "d"],
    [2592000, "w"],
  ];
  if (s < 60) return `${Math.floor(s)}s`;
  for (let i = 1; i < units.length; i += 1) {
    if (s < units[i][0]) return `${Math.floor(s / units[i - 1][0])}${units[i][1]}`;
  }
  return new Date(iso).toLocaleDateString();
};

/** Author line: a link for site members, plain dimmed text for everyone else. */
function Author({ clip }: { clip: Clip }) {
  const inner = (
    <>
      <AvatarImage steamId={clip.steamId} src={clip.avatar} alt={clip.author} className="avatar avatar-sm" />
      {clip.author}
    </>
  );
  return clip.authorIsUser === false ? (
    <span className="clip-author is-guest" title="No profile on this site yet">{inner}</span>
  ) : (
    <Link href={`/players/${clip.steamId}`} className="clip-author">{inner}</Link>
  );
}

export default function ClipCard({
  clip: initial,
  signedIn,
  isAdmin = false,
  onChanged,
}: {
  clip: Clip;
  signedIn: boolean;
  isAdmin?: boolean;
  onChanged?: () => void;
}) {
  const [clip, setClip] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [likes, setLikes] = useState(clip.likes);
  const [liked, setLiked] = useState(clip.likedByMe);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);

  const [open, setOpen] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [count, setCount] = useState(clip.comments);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const variants: Variant[] = (() => {
    if (clip.variants) {
      try {
        const parsed = JSON.parse(clip.variants) as Variant[];
        if (Array.isArray(parsed) && parsed.length) return parsed;
      } catch {
        // Fall through to the single-source form below.
      }
    }
    if (clip.kind === "upload") {
      return [{ name: "Source", height: 0, url: `/api/feed/video/${encodeURIComponent(clip.source)}` }];
    }
    if (clip.kind === "r2") return [{ name: "Source", height: 0, url: clip.source }];
    return [];
  })();

  const toggleLike = async () => {
    if (!signedIn || busy) return;
    setBusy(true);
    // Optimistic: a like should feel instant, and the server answer replaces it.
    setLiked((v) => !v);
    setLikes((n) => n + (liked ? -1 : 1));
    try {
      const res = await fetch(`/api/feed/clips/${clip.id}/like`, { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        setLiked(json.liked);
        setLikes(json.likes);
      }
    } finally {
      setBusy(false);
    }
  };

  const openComments = async () => {
    const next = !showComments;
    setShowComments(next);
    if (next && comments === null) {
      const res = await fetch(`/api/feed/clips/${clip.id}/comments`);
      const json = await res.json();
      setComments(json.comments ?? []);
    }
  };

  const postComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/feed/clips/${clip.id}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (res.ok) {
        setDraft("");
        setCount((n) => n + 1);
        const fresh = await fetch(`/api/feed/clips/${clip.id}/comments`).then((r) => r.json());
        setComments(fresh.comments ?? []);
      }
    } finally {
      setPosting(false);
    }
  };

  const removeComment = async (id: number) => {
    const res = await fetch(`/api/feed/clips/${clip.id}/comments?comment=${id}`, { method: "DELETE" });
    if (res.ok) {
      setComments((cs) => (cs ?? []).filter((c) => c.id !== id));
      setCount((n) => Math.max(0, n - 1));
    }
  };

  return (
    <article className="clip">
      <header className="clip-head">
        <Author clip={clip} />
        <span className="clip-head-right">
          {(clip.canEdit || isAdmin) && (
            <button className="btn btn-ghost clip-edit-btn" onClick={() => setEditing(true)} title="Edit this clip">
              Edit
            </button>
          )}
          <span className="clip-time" title={new Date(clip.createdAt).toLocaleString()}>{ago(clip.createdAt)}</span>
        </span>
      </header>

      <div className="clip-media">
        {clip.kind === "youtube" ? (
          playing ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${clip.source}?autoplay=1`}
              title={clip.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            // Click-to-load: an embed per card would pull YouTube's player for
            // every clip on the page before anyone pressed play.
            <button className="clip-poster" onClick={() => setPlaying(true)} aria-label={`Play ${clip.title}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {clip.thumb && <img src={clip.thumb} alt="" loading="lazy" />}
              <span className="clip-play" aria-hidden>▶</span>
              <span className="clip-badge">YouTube</span>
            </button>
          )
        ) : (
          // The card shows a poster; watching happens in the modal, so a grid
          // of clips never has a dozen live <video> elements in it.
          <button className="clip-poster" onClick={() => setOpen(true)} aria-label={`Open ${clip.title}`}>
            {clip.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={clip.thumb} alt="" loading="lazy" />
            ) : (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video src={variants[0]?.url} preload="metadata" muted playsInline />
            )}
            <span className="clip-play" aria-hidden>▶</span>
            {clip.durationSec ? (
              <span className="clip-badge">
                {Math.floor(clip.durationSec / 60)}:{String(clip.durationSec % 60).padStart(2, "0")}
              </span>
            ) : null}
          </button>
        )}
      </div>

      <div className="clip-body">
        <h3 className="clip-title">{clip.title}</h3>
        <p className={`clip-desc ${clip.description ? "" : "is-placeholder"}`}>
          {clip.description || describeFallback(clip)}
        </p>
      </div>

      <footer className="clip-actions">
        <button
          className={`clip-like ${liked ? "on" : ""}`}
          onClick={toggleLike}
          disabled={!signedIn}
          title={signedIn ? (liked ? "Unlike" : "Like") : "Sign in to like"}
          aria-pressed={liked}
        >
          {liked ? "♥" : "♡"} <span className="num">{likes}</span>
        </button>
        <button className="clip-comment-toggle" onClick={openComments} aria-expanded={showComments}>
          💬 <span className="num">{count}</span>
        </button>
        <ShareMenu clipId={clip.id} title={clip.title} compact />
      </footer>

      {showComments && (
        <div className="clip-comments">
          {comments === null ? (
            <p className="muted" style={{ fontSize: 13 }}>Loading…</p>
          ) : comments.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>No comments yet.</p>
          ) : (
            <ul>
              {comments.map((c) => (
                <li key={c.id}>
                  <AvatarImage steamId={c.steamId} src={c.avatar} alt={c.author} className="avatar avatar-sm" />
                  <div>
                    <span className="clip-comment-author">{c.author}</span>
                    <span className="clip-time"> · {ago(c.at)}</span>
                    <p>{c.body}</p>
                  </div>
                  {c.mine && (
                    <button className="btn btn-ghost" onClick={() => removeComment(c.id)} aria-label="Delete comment">
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {signedIn ? (
            <form className="clip-comment-form" onSubmit={postComment}>
              <label className="sr-only" htmlFor={`c-${clip.id}`}>Add a comment</label>
              <input
                id={`c-${clip.id}`}
                className="input"
                value={draft}
                maxLength={500}
                placeholder="Say something…"
                onChange={(e) => setDraft(e.target.value)}
              />
              <button className="btn btn-primary" type="submit" disabled={posting || !draft.trim()}>
                {posting ? "…" : "Post"}
              </button>
            </form>
          ) : (
            <p className="muted" style={{ fontSize: 13 }}>
              <a href="/api/auth/steam/login">Sign in</a> to comment.
            </p>
          )}
        </div>
      )}

      {open && <ClipModal clip={clip} variants={variants} onClose={() => setOpen(false)} />}

      {editing && (
        <ClipEditor
          clip={clip}
          isAdmin={isAdmin}
          onClose={() => setEditing(false)}
          onSaved={(patch) => {
            setClip((c) => ({ ...c, ...patch }));
            setEditing(false);
            onChanged?.();
          }}
          onDeleted={() => {
            setEditing(false);
            onChanged?.();
          }}
        />
      )}
    </article>
  );
}
