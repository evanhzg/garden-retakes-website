"use client";

import AvatarImage from "@/components/AvatarImage";

export type Presence = "online" | "offline" | "ingame" | "away";

/**
 * A rounded avatar with a presence dot on it.
 *
 * This composition existed three times and as a component zero times:
 * AvatarImage has no dot, the `.activity-indicator .dot` pattern in globals.css
 * is used only by ProfileActivity and is never put next to an avatar, and the
 * friends list drew its own `<span class="friend-avatar">` wrapper inline. The
 * collapsed social rail needs the same thing at a third size, which is one time
 * too many to keep copying it.
 *
 * The dot is drawn outside the image's circle rather than on top of it, so a
 * light avatar cannot swallow a green dot.
 */
export default function AvatarStatus({
  steamId,
  name,
  src,
  presence = "offline",
  size = 34,
  title,
}: {
  steamId: string;
  name?: string | null;
  src?: string | null;
  presence?: Presence;
  size?: number;
  title?: string;
}) {
  return (
    <span
      className={`avatar-status presence-${presence}`}
      style={{ ["--avatar-size" as string]: `${size}px` }}
      title={title ?? name ?? undefined}
    >
      <AvatarImage steamId={steamId} src={src ?? undefined} alt={name ?? steamId} />
      <i className="avatar-status-dot" aria-hidden="true" />
    </span>
  );
}
