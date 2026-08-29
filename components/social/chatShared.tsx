"use client";

import React, { useMemo } from "react";

/**
 * The pieces a conversation needs, shared between the friends panel and the
 * chat docks.
 *
 * They lived inside FriendsSidebar while there was exactly one conversation on
 * screen. Several docks at once means two files need the same message shape and
 * the same merge, and the alternative — the dock importing them back out of the
 * component that renders it — is a circular import held together by hope.
 */

export type Message = {
  id: number | string;
  from: string;
  to?: string;
  content: string;
  ts: number;
  isAdmin?: boolean;
  /** Set on a message we have drawn but not yet had confirmed by the server. */
  pending?: boolean;
};

/**
 * A slow reconciliation, not a live feed.
 *
 * Delivery is the socket relay's job. This exists only so a thread that was
 * open while the socket was down catches up, and it is deliberately far too
 * slow to be the thing anyone notices working.
 */
export const RECONCILE_MS = 30_000;
/** How long a "typing" indicator survives without another keystroke. */
export const TYPING_TTL_MS = 4_000;
export const TYPING_PING_MS = 2_000;

export const sameDay = (a: number, b: number) => {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
};

export const dayLabel = (ts: number) => {
  const now = new Date();
  const then = new Date(ts);
  if (sameDay(ts, now.getTime())) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(ts, yesterday.getTime())) return "Yesterday";
  return then.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

export const timeLabel = (ts: number) =>
  new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/** Oldest-first by time, with an optimistic line replaced by its confirmed self. */
export const mergeMessages = (a: Message[], b: Message[]): Message[] => {
  const byId = new Map<string, Message>();
  for (const m of [...a, ...b]) {
    const key = String(m.id);
    const existing = byId.get(key);
    // A confirmed message always beats the optimistic copy of itself.
    if (!existing || existing.pending) byId.set(key, m);
  }
  return Array.from(byId.values()).sort((x, y) => x.ts - y.ts);
};

/** A message, plus the inline player for a clip hosted on this site. */
export function MessageBody({ content }: { content: string }) {
  const clip = useMemo(() => {
    const match = content.match(/https?:\/\/[^\s]+/);
    if (!match) return null;
    try {
      const url = new URL(match[0]);
      const local =
        typeof window !== "undefined" && url.host === window.location.host;
      if (!local) return null;
      if (!/\.mp4$/i.test(url.pathname) && !/\/clips?\//.test(url.pathname)) return null;
      return url.toString();
    } catch {
      return null;
    }
  }, [content]);

  if (!clip) return <>{content}</>;

  return (
    <>
      <span>{content}</span>
      <video src={clip} controls preload="metadata" className="dm-clip" />
    </>
  );
}
