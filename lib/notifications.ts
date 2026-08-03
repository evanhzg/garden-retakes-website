import "server-only";
import { prisma } from "@/lib/db";

// Notifications.
//
// Two kinds, deliberately stored differently.
//
// Targeted ones — someone liked your clip, replied to you, mentioned you — are
// rows, because they belong to one person and there are few of them.
//
// Global ones — a CS2 patch, a clip posted — are *not* rows. Fanning one out to
// every player would write a row per person per event to say the same thing,
// and the only per-person fact involved is whether they have looked since. So
// those are derived at read time against a single "last opened" timestamp.

export type NotificationKind =
  | "CLIP_LIKE"
  | "CLIP_COMMENT"
  | "CLIP_MENTION"
  | "CLIP_POSTED"
  | "CS2_UPDATE"
  | "FRIEND_REQUEST"
  | "GAME_INVITE"
  | "SYSTEM";

export const NOTIFICATION_META: Record<string, { icon: string; label: string }> = {
  CLIP_LIKE: { icon: "♥", label: "Like" },
  CLIP_COMMENT: { icon: "💬", label: "Comment" },
  CLIP_MENTION: { icon: "@", label: "Mention" },
  CLIP_POSTED: { icon: "▶", label: "New clip" },
  CS2_UPDATE: { icon: "◆", label: "CS2 update" },
  FRIEND_REQUEST: { icon: "◉", label: "Friend request" },
  GAME_INVITE: { icon: "⚔", label: "Invite" },
  SYSTEM: { icon: "•", label: "Notice" },
};

/**
 * Record a targeted notification.
 *
 * Never notifies someone about their own action — liking your own clip should
 * not ping you — and never throws, because a notification failing is not a
 * reason for the like that caused it to fail.
 */
export async function notify(opts: {
  steamId: bigint;
  actorSteamId?: bigint | null;
  type: NotificationKind;
  content: string;
  actionUrl?: string;
}): Promise<void> {
  try {
    if (opts.actorSteamId && opts.actorSteamId === opts.steamId) return;
    await prisma.webNotification.create({
      data: {
        SteamId: opts.steamId,
        Type: opts.type,
        Content: opts.content.slice(0, 256),
        ActionUrl: opts.actionUrl?.slice(0, 256) ?? null,
      },
    });
  } catch {
    // Best effort by design.
  }
}

/**
 * Mentions are stored as <@76561198…> rather than the typed text.
 *
 * Storing "@evan" would break the moment they change their display name, and
 * would make "@evan" typed by hand indistinguishable from a real mention. The
 * id is the fact; the name is a rendering of it.
 */
export const MENTION_RE = /<@(\d{17})>/g;

export function mentionedIds(body: string): string[] {
  return Array.from(new Set(Array.from(body.matchAll(MENTION_RE)).map((m) => m[1])));
}

/** Strip mention syntax down to plain text, for notification summaries. */
export function plainText(body: string, names: Map<string, string>): string {
  return body.replace(MENTION_RE, (_, id) => names.get(id) ?? "someone");
}
