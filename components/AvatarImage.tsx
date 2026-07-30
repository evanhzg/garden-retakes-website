"use client";

import { useState, useEffect } from "react";

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

  useEffect(() => {
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
  }, [src, idStr]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      style={style}
      src={imgSrc}
      alt={alt}
      loading="lazy"
      onError={() => {
        if (imgSrc !== DEFAULT_AVATAR) setImgSrc(DEFAULT_AVATAR);
      }}
    />
  );
}
