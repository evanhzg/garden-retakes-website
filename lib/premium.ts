// Who may turn Premium on.
//
// Premium is two things that arrived at different times. The half that exists
// is the matchmaking behaviour: a tighter rating band, a slower widen, a longer
// queue and a closer lobby — see BANDS in scripts/retakesMatchmaking.js. The
// half that does not is the subscription that is meant to gate it.
//
// So the gate is here from the start and answers yes to everybody. That is a
// decision rather than an oversight: building the button, the toggle state and
// the server-side check now means the day a subscription exists, one function
// changes and nothing else has to learn what premium is. A flag added later
// would instead mean finding every place that assumed it was free.
//
// Mirrored as isPremium() in scripts/retakesMatchmaking.js, which is CommonJS
// on the socket server and cannot import this. Same convention as
// effectiveElo() in lib/competitive.ts. Change both.

/**
 * Whether this account may queue Premium.
 *
 * Everyone, for now. When subscriptions land this becomes a lookup, and it is
 * the only place that needs to.
 */
export function isPremium(steamId: string | bigint | null | undefined): boolean {
  void steamId;
  return true;
}

/**
 * Why the toggle is unavailable, for the tooltip — null when it is available.
 *
 * Exists so the UI never has to guess: today nothing is locked, and when
 * something is, the reason travels with the lock rather than being written out
 * again next to it.
 */
export function premiumLockReason(
  steamId: string | bigint | null | undefined
): "not_subscribed" | null {
  return isPremium(steamId) ? null : "not_subscribed";
}
