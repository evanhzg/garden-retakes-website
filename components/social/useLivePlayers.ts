"use client";

import { useEffect, useState } from "react";

/** One player the game server currently has. */
export type LivePlayer = { steamId: string; team: string };

/** How often to ask. The server's own feed does not move faster than this. */
const POLL_MS = 15_000;

/**
 * Who is in a game right now.
 *
 * Extracted from LeftSidebar, which has had this since before the social panel
 * existed and is where the weighting below comes from. The panel had a
 * presence dot with an `ingame` state that was already STYLED — an accent glow
 * in social.css — and nothing anywhere rendered it: the two halves were built
 * separately and never joined up. So a friend in a match looked exactly like a
 * friend reading the forum.
 *
 * One hook rather than a second fetch, because two pollers with two shapes is
 * how the sidebar and the panel end up disagreeing about who is playing.
 */
export function useLivePlayers(): LivePlayer[] {
  const [live, setLive] = useState<LivePlayer[]>([]);

  useEffect(() => {
    let cancelled = false;

    const fetchLive = async () => {
      try {
        const res = await fetch("/api/live", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          if (json.live && json.data?.Players) {
            if (!cancelled) {
              setLive(
                json.data.Players.map((p: { SteamId: string; Team: string }) => ({
                  steamId: String(p.SteamId),
                  team: String(p.Team),
                })),
              );
            }
            return;
          }
        }
        if (!cancelled) setLive([]);
      } catch {
        // No server, or no answer. Nobody is shown as playing, which is the
        // same thing the page said before this existed.
        if (!cancelled) setLive([]);
      }
    };

    fetchLive();
    const timer = setInterval(fetchLive, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return live;
}

/**
 * What to show for one player, in the vocabulary AvatarStatus already speaks.
 *
 * The three states and their order are LeftSidebar's, kept verbatim: playing
 * beats spectating beats nothing. Team "1" and "Spectator" are the same thing
 * said two ways by two versions of the feed, which is why both are listed.
 */
export function presenceOf(
  steamId: string,
  live: LivePlayer[],
  isOnline: boolean,
): "ingame" | "spectating" | "online" | "offline" {
  const found = live.find((p) => p.steamId === steamId);

  if (found) {
    return found.team === "Spectator" || found.team === "1" ? "spectating" : "ingame";
  }

  return isOnline ? "online" : "offline";
}

/**
 * What the game feed says about one player, in the vocabulary lib/presence.ts
 * expects: "playing", "spectating", or null for neither.
 *
 * Separate from presenceOf because that one answers the whole question — it
 * folds in whether the viewer is connected — and shownPresence wants the
 * observed half on its own so it can weigh it against a chosen status.
 */
export function gameStateOf(
  steamId: string,
  live: LivePlayer[],
): "playing" | "spectating" | null {
  const found = live.find((p) => p.steamId === steamId);
  if (!found) return null;
  return found.team === "Spectator" || found.team === "1" ? "spectating" : "playing";
}
