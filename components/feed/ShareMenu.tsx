"use client";

import { useEffect, useRef, useState } from "react";

// Sharing a clip.
//
// Every target here takes the same permalink, which is what does the work: the
// page behind it carries og:video and twitter:player, so the link unfurls into
// a playing video instead of a bare URL.
//
// Discord has no share intent — nothing to link to, no SDK worth loading for
// one button — so it copies. That is not a lesser path: pasting the link into
// Discord is what produces the inline player, and the label says so.

type Target = { id: string; label: string; hint: string };

const TARGETS: Target[] = [
  { id: "copy", label: "Copy link", hint: "Paste anywhere" },
  { id: "discord", label: "Discord", hint: "Copies — it embeds when pasted" },
  { id: "x", label: "X", hint: "Opens a post" },
  { id: "reddit", label: "Reddit", hint: "Opens a submission" },
];

export default function ShareMenu({
  clipId,
  title,
  compact = false,
}: {
  clipId: number;
  title: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Built in the browser so it is right on any host — production, a preview
  // deployment or localhost — without threading an origin through the tree.
  const link = typeof window === "undefined" ? "" : `${window.location.origin}/feed/${clipId}`;

  const copy = async (label: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(label);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      // Clipboard is blocked without a user gesture in some browsers; select
      // the text instead so it can still be copied by hand.
      window.prompt("Copy this link:", link);
    }
  };

  const share = (target: string) => {
    const text = encodeURIComponent(title);
    const url = encodeURIComponent(link);
    if (target === "x") {
      window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, "_blank", "noopener,noreferrer");
    } else if (target === "reddit") {
      window.open(`https://www.reddit.com/submit?url=${url}&title=${text}`, "_blank", "noopener,noreferrer");
    } else {
      copy(target === "discord" ? "Discord" : "Link");
      return;
    }
    setOpen(false);
  };

  /** The OS share sheet, where there is one — worth more than any menu on a phone. */
  const nativeShare = async () => {
    if (typeof navigator === "undefined" || !navigator.share) return false;
    try {
      await navigator.share({ title, url: link });
      return true;
    } catch {
      return true; // dismissed; do not then open the menu on top of it
    }
  };

  return (
    <div className="share" ref={wrapRef}>
      <button
        className={`btn ${compact ? "btn-ghost clip-share-btn" : "btn-secondary"}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Share this clip"
        onClick={async () => {
          if (await nativeShare()) return;
          setOpen((v) => !v);
        }}
      >
        {copied ? `${copied} copied` : "Share"}
      </button>

      {open && (
        <div className="share-menu" role="menu">
          {TARGETS.map((t) => (
            <button key={t.id} role="menuitem" className="share-item" onClick={() => share(t.id)}>
              <span className="share-item-label">{t.label}</span>
              <span className="share-item-hint">{t.hint}</span>
            </button>
          ))}
          <div className="share-link">
            <input className="input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Clip link" />
          </div>
        </div>
      )}
    </div>
  );
}
