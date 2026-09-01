"use client";

/**
 * One request for a list of faces, instead of one per face.
 *
 * /api/avatars has always taken up to 200 ids at a time, and AvatarImage has
 * always asked for exactly one — so a scoreboard of ten players was ten
 * requests, a roster of sixteen was sixteen, and a leaderboard opening three
 * boards was thirty. Each one costs a Vercel function invocation and a Steam
 * lookup behind it.
 *
 * Nothing about the call sites has to change for this to work: the ids that
 * arrive in the same tick are collected and sent together. A React render
 * commits a whole list at once, which is exactly the window this is measuring.
 *
 * The cache is per page load and never invalidated. An avatar that changes
 * mid-visit showing the old face until the next navigation is not a bug worth
 * a cache-busting protocol; the same reasoning as the route's own
 * `max-age=300`.
 */

/** Resolved, or null for "asked and there is nothing". */
const cache = new Map<string, string | null>();

/** Ids waiting for the next flush, and who to tell. */
let pending = new Set<string>();
let waiters: { ids: string[]; resolve: (m: Map<string, string | null>) => void }[] = [];
let scheduled = false;

/** The route's own cap. Split rather than dropped, so a big list still works. */
const MAX_PER_REQUEST = 200;

async function flush() {
  scheduled = false;

  const ids = Array.from(pending);
  const listeners = waiters;
  pending = new Set();
  waiters = [];

  if (ids.length === 0) return;

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += MAX_PER_REQUEST) {
    chunks.push(ids.slice(i, i + MAX_PER_REQUEST));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const res = await fetch(`/api/avatars?ids=${encodeURIComponent(chunk.join(","))}`);
        const map = res.ok ? await res.json() : {};
        // Every id in the chunk is marked answered, including the ones with no
        // avatar — otherwise a player without one is asked for again on every
        // render, forever.
        for (const id of chunk) cache.set(id, map?.[id] ?? null);
      } catch {
        // A failed batch is not cached: the next render may as well try again.
      }
    }),
  );

  for (const w of listeners) {
    const answer = new Map<string, string | null>();
    for (const id of w.ids) answer.set(id, cache.get(id) ?? null);
    w.resolve(answer);
  }
}

/**
 * Resolve one avatar, batched with everything else asked for this tick.
 *
 * Returns the cached value synchronously through `cached()` when there is one;
 * this is the async path for the rest.
 */
export function requestAvatar(steamId: string): Promise<string | null> {
  if (cache.has(steamId)) return Promise.resolve(cache.get(steamId) ?? null);

  pending.add(steamId);

  const p = new Promise<Map<string, string | null>>((resolve) => {
    waiters.push({ ids: [steamId], resolve });
  });

  if (!scheduled) {
    scheduled = true;
    // A microtask, not a timeout: React commits a list in one go, so
    // everything that mounted together is already queued by the time this
    // runs, and nothing waits on a timer it did not need.
    queueMicrotask(() => {
      void flush();
    });
  }

  return p.then((m) => m.get(steamId) ?? null);
}

/** What is already known, for the first render. */
export function cachedAvatar(steamId: string): string | null | undefined {
  return cache.get(steamId);
}

/**
 * Seed the cache from a server-resolved map.
 *
 * A page that already called resolveAvatars() knows the answers; telling the
 * cache means the client never asks again for the same faces further down the
 * page.
 */
export function seedAvatars(map: Record<string, string>) {
  for (const [id, url] of Object.entries(map)) cache.set(id, url);
}
