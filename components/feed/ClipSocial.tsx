"use client";

import { useEffect, useRef, useState } from "react";
import AvatarImage from "@/components/AvatarImage";
import CommentBox, { CommentBody } from "@/components/feed/CommentBox";
import type { Clip } from "@/components/feed/ClipCard";

// Likes and comments, under the video in the expanded player.
//
// Its own component rather than reusing the card's block, because the card's
// version is collapsed by default and this one is always open — and because
// the modal needs it to scroll independently so a long thread never pushes the
// video off the screen.

type Comment = {
  id: number;
  steamId: string;
  author: string;
  avatar?: string;
  body: string;
  at: string;
  mine: boolean;
  likes?: number;
  likedByMe?: boolean;
};

const ago = (iso: string) => {
  const s = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

export default function ClipSocial({ clip, signedIn }: { clip: Clip; signedIn: boolean }) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [likes, setLikes] = useState(clip.likes);
  const [liked, setLiked] = useState(clip.likedByMe);
  const [posting, setPosting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const load = () =>
    fetch(`/api/feed/clips/${clip.id}/comments`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        setComments(j.comments ?? []);
        setNames(j.mentionNames ?? {});
      })
      .catch(() => setComments([]));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip.id]);

  const toggleLike = async () => {
    if (!signedIn) return;
    setLiked((v) => !v);
    setLikes((n) => n + (liked ? -1 : 1));
    const res = await fetch(`/api/feed/clips/${clip.id}/like`, { method: "POST" });
    if (res.ok) {
      const j = await res.json();
      setLiked(j.liked);
      setLikes(j.likes);
    }
  };

  const likeComment = async (id: number) => {
    if (!signedIn) return;
    setComments((cs) => (cs ?? []).map((c) =>
      c.id === id ? { ...c, likedByMe: !c.likedByMe, likes: (c.likes ?? 0) + (c.likedByMe ? -1 : 1) } : c));
    const res = await fetch(`/api/feed/comments/${id}/like`, { method: "POST" });
    if (res.ok) {
      const j = await res.json();
      setComments((cs) => (cs ?? []).map((c) => (c.id === id ? { ...c, likedByMe: j.liked, likes: j.likes } : c)));
    }
  };

  const post = async (body: string) => {
    setPosting(true);
    try {
      const res = await fetch(`/api/feed/clips/${clip.id}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (res.ok) await load();
    } finally {
      setPosting(false);
    }
  };

  const remove = async (id: number) => {
    const res = await fetch(`/api/feed/clips/${clip.id}/comments?comment=${id}`, { method: "DELETE" });
    if (res.ok) setComments((cs) => (cs ?? []).filter((c) => c.id !== id));
  };

  return (
    <div className="clip-social">
      <div className="clip-social-bar">
        <button
          className={`clip-like ${liked ? "on" : ""}`}
          onClick={toggleLike}
          disabled={!signedIn}
          aria-pressed={liked}
          title={signedIn ? (liked ? "Unlike" : "Like") : "Sign in to like"}
        >
          {liked ? "♥" : "♡"} <span className="num">{likes}</span>
        </button>
        <button
          className="clip-social-jump"
          onClick={() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })}
          disabled={!comments || comments.length === 0}
        >
          {comments === null ? "" : `${comments.length} comment${comments.length === 1 ? "" : "s"}`}
        </button>
      </div>

      <div className="clip-social-scroll" ref={listRef}>
        {comments === null ? (
          <p className="muted" style={{ fontSize: 13 }}>Loading…</p>
        ) : comments.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>No comments yet.</p>
        ) : (
          <ul className="clip-comments-list">
            {comments.map((c) => (
              <li key={c.id}>
                <AvatarImage steamId={c.steamId} src={c.avatar} alt={c.author} className="avatar avatar-sm" />
                <div>
                  <span className="clip-comment-author">{c.author}</span>
                  <span className="clip-time"> · {ago(c.at)}</span>
                  <p><CommentBody body={c.body} names={names} /></p>
                  <div className="clip-comment-actions">
                    <button
                      className={`clip-comment-like ${c.likedByMe ? "on" : ""}`}
                      onClick={() => likeComment(c.id)}
                      disabled={!signedIn}
                      aria-pressed={Boolean(c.likedByMe)}
                    >
                      {c.likedByMe ? "♥" : "♡"} <span className="num">{c.likes ?? 0}</span>
                    </button>
                    {c.mine && (
                      <button className="clip-comment-del" onClick={() => remove(c.id)}>Delete</button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {signedIn ? (
        <CommentBox id={`m-${clip.id}`} posting={posting} onSubmit={post} />
      ) : (
        <p className="muted" style={{ fontSize: 13 }}>
          <a href="/api/auth/steam/login">Sign in</a> to like and comment.
        </p>
      )}
    </div>
  );
}
