import React from "react";

/**
 * The face a bot wears everywhere a player has one.
 *
 * A bot's SteamID is synthetic — 76561999… — so there is no Steam profile
 * behind it and /api/avatars has nothing to return. Every bot therefore fell
 * through to /default_pp.png, which is also what a real player with no avatar
 * gets: an all-bot match looked like eight anonymous humans, and the one place
 * it mattered most was the MVP card, where the best player of the match was a
 * grey silhouette.
 *
 * Drawn rather than generated or fetched. It has to work in an avatar slot
 * anywhere from 16px in a feed line to 96px on an MVP card, and an SVG is the
 * only version of this that is sharp at both ends and costs no request.
 *
 * The hue is derived from the id, so the six bots in a match are six different
 * colours and stay the same colour everywhere they appear — the scoreboard, the
 * roster and the MVP card agree without anybody storing anything.
 */
export default function BotAvatar({
  steamId,
  className,
  style,
}: {
  steamId: string | bigint;
  className?: string;
  style?: React.CSSProperties;
}) {
  const id = steamId.toString();

  // Last three digits, spread around the wheel. Deliberately not a hash: the
  // ids are sequential, so the low digits already vary between the bots in a
  // match, and 137 is coprime with 360 so consecutive bots land far apart
  // rather than in a gradient.
  const hue = (Number(id.slice(-3)) * 137) % 360;

  const face = `hsl(${hue} 62% 62%)`;
  const shade = `hsl(${hue} 55% 44%)`;
  const glow = `hsl(${hue} 90% 74%)`;

  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      style={{ maxWidth: "100%", display: "block", ...style }}
      role="img"
      aria-label="Bot"
    >
      <rect width="64" height="64" fill={`hsl(${hue} 30% 16%)`} />

      {/* Antenna, which is most of what makes a rounded rectangle read as a
          robot rather than as a television. */}
      <line x1="32" y1="10" x2="32" y2="17" stroke={shade} strokeWidth="2.5" />
      <circle cx="32" cy="8" r="3" fill={glow} />

      {/* Head */}
      <rect x="14" y="17" width="36" height="30" rx="7" fill={face} />
      <rect x="14" y="17" width="36" height="30" rx="7" fill="none" stroke={shade} strokeWidth="2" />

      {/* Eyes. Wide apart and large, because at 16px in a feed line the eyes are
          the only feature that survives. */}
      <circle cx="24" cy="31" r="4.6" fill={`hsl(${hue} 35% 14%)`} />
      <circle cx="40" cy="31" r="4.6" fill={`hsl(${hue} 35% 14%)`} />
      <circle cx="25.4" cy="29.6" r="1.6" fill={glow} />
      <circle cx="41.4" cy="29.6" r="1.6" fill={glow} />

      {/* Mouth grille */}
      <rect x="25" y="39" width="14" height="4" rx="2" fill={shade} />

      {/* Ears */}
      <rect x="9" y="27" width="4" height="10" rx="2" fill={shade} />
      <rect x="51" y="27" width="4" height="10" rx="2" fill={shade} />

      {/* Shoulders, so the head is not floating in a square. */}
      <path d="M12 64c0-8 9-13 20-13s20 5 20 13z" fill={shade} />
    </svg>
  );
}

/**
 * A bot's synthetic id.
 *
 * Kept here rather than imported from lib/tournament/pickup so this component
 * can be used from anywhere without dragging the pickup rules in behind it. The
 * shape is defined in lib/tournament/bots.ts and asserted by its tests; this is
 * the same test written where the avatar needs it.
 */
export const isBotSteamId = (id: string | bigint) => /^76561999\d{9}$/.test(id.toString().trim());
