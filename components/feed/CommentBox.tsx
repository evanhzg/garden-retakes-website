"use client";

import { useEffect, useRef, useState } from "react";

// Writing a comment, with @-mentions.
//
// A mention is stored as <@76561198…> rather than the text that was typed.
// Storing "@evan" would break the moment they change their name, and would
// make an @evan typed by hand indistinguishable from a real mention — the id
// is the fact, the name is a rendering of it.

type Suggestion = { steamId: string; name: string };

export default function CommentBox({
  onSubmit,
  posting,
  placeholder = "Say something…",
  id,
}: {
  onSubmit: (body: string) => void;
  posting: boolean;
  placeholder?: string;
  id: string;
}) {
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  /** Where the @ that opened the picker starts, or -1. */
  const anchor = useRef(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  // Look up the fragment after the @, debounced.
  useEffect(() => {
    const caret = inputRef.current?.selectionStart ?? text.length;
    const before = text.slice(0, caret);
    const m = /@([\w\-\[\]]{0,20})$/.exec(before);
    if (!m) {
      anchor.current = -1;
      setSuggestions([]);
      return;
    }
    anchor.current = caret - m[0].length;
    const q = m[1];
    const t = setTimeout(() => {
      fetch(`/api/players/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((j) => {
          setSuggestions(j.players ?? []);
          setActive(0);
        })
        .catch(() => setSuggestions([]));
    }, 160);
    return () => clearTimeout(t);
  }, [text]);

  const pick = (s: Suggestion) => {
    const caret = inputRef.current?.selectionStart ?? text.length;
    if (anchor.current < 0) return;
    const next = `${text.slice(0, anchor.current)}<@${s.steamId}> ${text.slice(caret)}`;
    setText(next);
    setSuggestions([]);
    anchor.current = -1;
    inputRef.current?.focus();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || posting) return;
    onSubmit(body);
    setText("");
  };

  return (
    <form className="clip-comment-form" onSubmit={submit}>
      <div className="mention-wrap">
        <label className="sr-only" htmlFor={id}>Add a comment</label>
        <input
          id={id}
          ref={inputRef}
          className="input"
          value={text}
          maxLength={500}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (suggestions.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => (i + 1) % suggestions.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
            } else if (e.key === "Enter" || e.key === "Tab") {
              // Enter picks the highlighted player rather than posting a
              // half-typed mention.
              e.preventDefault();
              pick(suggestions[active]);
            } else if (e.key === "Escape") {
              setSuggestions([]);
            }
          }}
        />

        {suggestions.length > 0 && (
          <ul className="mention-menu" role="listbox">
            {suggestions.map((s, i) => (
              <li key={s.steamId}>
                <button
                  type="button"
                  className={i === active ? "on" : ""}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(s)}
                >
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button className="btn btn-primary" type="submit" disabled={posting || !text.trim()}>
        {posting ? "…" : "Post"}
      </button>
    </form>
  );
}

/** Render stored mentions as the player's name, in accent, without the @. */
export function CommentBody({ body, names }: { body: string; names: Record<string, string> }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of Array.from(body.matchAll(/<@(\d{17})>/g))) {
    if (m.index === undefined) continue;
    if (m.index > last) parts.push(body.slice(last, m.index));
    parts.push(
      <span className="mention" key={`${m.index}-${m[1]}`}>
        {names[m[1]] ?? "someone"}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return <>{parts}</>;
}
