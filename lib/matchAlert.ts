// Getting somebody's attention when they are not looking at the tab.
//
// Two moments deserve it and neither had it: a match being found, which starts
// a twenty-second accept window, and the server coming up, which is the point
// at which there is somewhere to connect to. Both were silent, so the way you
// found out was by having the page open and happening to look at it.
//
// Sound is synthesized rather than loaded, for the reason
// components/games/sound/SoundManager.ts gives: no asset to ship, no CSP
// question, no request that can fail. This is a much smaller thing than that
// manager — two notes and a chord — and lives apart from it because its
// SoundName union is about dice and card games.
//
// Everything here fails quietly. A browser that refuses audio without a
// gesture, a user who denied notifications, a tab that has been discarded:
// none of those are errors, and none of them should surface anywhere.

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    // Autoplay policy suspends a context created before any gesture. Resuming
    // is free when it is already running.
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

/** One note. `at` is seconds from now. */
function note(freq: number, at: number, length: number, gain: number) {
  const ac = audio();
  if (!ac) return;
  try {
    const t0 = ac.currentTime + at;
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, t0);
    // A hard start and stop clicks; the ramps are what make it a note.
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
    osc.connect(amp);
    amp.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + length + 0.02);
  } catch {
    // No sound is not a failure worth reporting.
  }
}

/** Rising pair: something needs you. */
export function playMatchFound() {
  note(660, 0, 0.16, 0.22);
  note(880, 0.14, 0.26, 0.22);
}

/** Major triad, resolved: the thing you were waiting for is ready. */
export function playServerReady() {
  note(523.25, 0, 0.18, 0.2);
  note(659.25, 0.1, 0.2, 0.2);
  note(783.99, 0.2, 0.42, 0.22);
}

/**
 * Ask for notification permission, on a gesture.
 *
 * Called from the Play button rather than on mount: asking the moment a page
 * loads is the prompt everybody dismisses, and a dismissed prompt cannot be
 * asked again. By the time somebody presses Play they have said they intend to
 * be told something.
 */
export function primeNotifications() {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") void Notification.requestPermission();
  } catch {
    // Some embedded browsers throw on the constructor itself.
  }
}

/**
 * Tell them, if the tab is not the one they are looking at.
 *
 * Deliberately silent when the page is visible: a notification for something
 * already on screen is noise, and the sound has already played.
 */
export function notify(title: string, body: string, tag: string) {
  try {
    if (typeof document !== "undefined" && document.visibilityState === "visible") return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    // `tag` collapses repeats: a server that re-reports ready must not stack.
    new Notification(title, { body, tag, icon: "/favicon.ico" });
  } catch {
    // Denied, unsupported, or a browser that requires a service worker for
    // these. None of those is worth an error.
  }
}
