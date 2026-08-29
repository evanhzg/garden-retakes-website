import { waitUntil } from "@vercel/functions";

/**
 * Work that outlives the response.
 *
 * `void slowThing()` does not do this on a serverless host, and believing that
 * it did is what left tournament matches half-started. The pattern reads as
 * "fire and forget", and locally that is exactly what happens — Node keeps
 * running until the promise settles. In production the instance is frozen the
 * moment the response is returned, so the promise is abandoned wherever it had
 * got to.
 *
 * The damage was not a missing side effect but a partial one. `startMatch`
 * loads the map, waits up to thirty seconds for it, declares both rosters, the
 * roles and the bots, and only then fixes the sides and starts the match. Cut
 * anywhere in the middle it leaves a server holding a half-declared match, a
 * row still saying "ready", and a `catch` that never ran to undo either — so
 * nothing retried and nothing reported a failure. From the outside: an empty
 * server, no bots, and a warmup that never ends.
 *
 * `waitUntil` is the platform's answer. The response goes back immediately and
 * the instance stays alive until the promise settles, which is what the
 * original comment wanted: the captain's browser is not held for thirty seconds
 * AND the match still starts.
 *
 * Errors are swallowed deliberately. Every caller is a side effect the request
 * itself does not depend on — starting the next queued match, driving a bot
 * match — and a throw here would reject a promise nobody awaits. They are
 * logged instead, because a background failure with no trace is the thing that
 * made this take so long to find.
 */
export function background(label: string, work: () => Promise<unknown>): void {
  const guarded = (async () => {
    try {
      await work();
    } catch (err) {
      console.error(`[background:${label}]`, err);
    }
  })();

  try {
    waitUntil(guarded);
  } catch {
    // Outside a Vercel request — a test, a script, `next dev`. There is no
    // instance to keep alive and nothing to hand the promise to; the process
    // lives as long as the work does, which is the behaviour this is imitating.
  }
}
