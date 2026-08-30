"use client";

import { useState, useEffect } from "react";

import BotAvatar, { isBotSteamId } from "./BotAvatar";

const DEFAULT_AVATAR = "/default_pp.png";

/**
 * Player avatar.
 *
 * `src` should be a resolved Steam URL — server components get it from
 * resolveAvatars() in lib/avatars.ts. When it is omitted the component asks
 * /api/avatars, so client-rendered lists still show real avatars.
 *
 * This used to default to `/<steamId>_pp.png`, a local file in public/ that
 * exists for almost no one, so nearly every avatar on the site fell through to
 * the placeholder.
 */
export default function AvatarImage({
  steamId,
  src,
  alt = "Avatar",
  className,
  style,
}: {
  steamId: string | bigint;
  src?: string | null;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const idStr = steamId.toString();
  const [imgSrc, setImgSrc] = useState<string>(src || DEFAULT_AVATAR);

  /**
   * A bot gets a bot's face, everywhere.
   *
   * Its SteamID is synthetic, so there is no profile to look up and the fetch
   * below can only ever fall through to the placeholder — which is also what a
   * real player with no avatar gets. An all-bot match therefore looked like a
   * row of anonymous humans, most visibly on the MVP card.
   *
   * Decided here rather than at each call site because every avatar on the site
   * comes through this component, and the alternative is remembering to special
   * case bots in the scoreboard, the roster, the feed, the MVP card and
   * whatever is added next.
   */
  const isBot = isBotSteamId(idStr);

  useEffect(() => {
    // Nothing to look up for a bot, and asking would be a request per bot per
    // list for an answer that does not exist.
    if (isBot) return;

    if (src) {
      setImgSrc(src);
      return;
    }
    // No resolved URL from the server — look it up. Aborted on unmount so a
    // fast list scroll does not set state on unmounted components.
    const ac = new AbortController();
    fetch(`/api/avatars?ids=${encodeURIComponent(idStr)}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (m?.[idStr]) setImgSrc(m[idStr]);
      })
      .catch(() => {});
    return () => ac.abort();
  }, [src, idStr, isBot]);

  if (isBot) {
    return <BotAvatar steamId={idStr} className={className} style={style} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      style={{ maxWidth: "100%", ...style }}
      src={imgSrc}
      alt={alt}
      loading="lazy"
      onError={() => {
        if (imgSrc !== DEFAULT_AVATAR) setImgSrc(DEFAULT_AVATAR);
      }}
    />
  );
}
