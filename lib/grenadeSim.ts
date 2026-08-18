import type { CollisionIndex } from "@/lib/mapCollision";
import type { PathSample } from "@/lib/utility3d";

/**
 * Simulating a grenade's flight.
 *
 * Phase one draws arcs that were recorded. This computes them, which is what
 * lets the viewer answer "what would happen if I stood *here* and looked
 * *there*" rather than only "here is what somebody once threw".
 *
 * <b>The constants are not folklore.</b> Every value below is a named,
 * adjustable parameter with a stated source, because the honest position is
 * that CS2's exact numbers are not public and the ones here are the
 * community-established values. What makes that acceptable rather than a guess
 * is {@link endpointError}: we have hundreds of *recorded* arcs, so a
 * simulation can be scored against measured reality instead of eyeballed. A
 * constant that is wrong shows up as a number.
 */

export type ThrowConstants = {
  /** sv_gravity, units per second squared. */
  gravity: number;
  /**
   * CBaseGrenade's gravity scale. Grenades fall slower than players — this is
   * why a smoke floats the way it does and a bullet does not.
   */
  gravityScale: number;
  /** How much speed survives a bounce, along the surface normal. */
  restitution: number;
  /** How much sideways speed a bounce scrubs off. */
  friction: number;
  /** Full-power throw speed out of the hand. */
  throwSpeed: number;
  /** Below this, it has stopped bouncing and is rolling or at rest. */
  restSpeed: number;
  /** Integration step. Smaller is more accurate and more work. */
  step: number;
  /** Give up after this long. A grenade that has not settled is stuck. */
  maxSeconds: number;
};

/**
 * Community-established CS2 values.
 *
 * gravityScale 0.4 and restitution 0.45 are the long-standing CS:GO grenade
 * numbers, carried into CS2 and consistent with what recorded arcs look like.
 * They are the *starting point* for fitting, not an answer: see
 * {@link endpointError} and tools/fit-grenade-constants.mjs.
 */
export const DEFAULT_CONSTANTS: ThrowConstants = {
  gravity: 800,
  gravityScale: 0.4,
  restitution: 0.45,
  friction: 0.2,
  throwSpeed: 750,
  restSpeed: 20,
  step: 1 / 128,
  maxSeconds: 12,
};

/** Throw strengths, as the four things a player can actually do. */
export const THROW_POWER = {
  /** Left click. */
  full: 1,
  /** Left + right together. */
  medium: 0.5,
  /** Right click. */
  soft: 0.35,
} as const;

/**
 * The velocity a throw leaves the hand with.
 *
 * The player's own velocity is added at 1.25× — which is why a run-throw goes
 * further than a standing one, and why a lineup that does not say whether you
 * were moving is not a lineup. The eye direction uses Source's angle
 * convention: pitch is inverted, so a *negative* pitch is looking up.
 */
export function throwVelocity(
  pitchDegrees: number,
  yawDegrees: number,
  power: number,
  playerVelocity: readonly [number, number, number] = [0, 0, 0],
  constants: ThrowConstants = DEFAULT_CONSTANTS,
): [number, number, number] {
  const pitch = (-pitchDegrees * Math.PI) / 180;
  const yaw = (yawDegrees * Math.PI) / 180;

  const forward: [number, number, number] = [
    Math.cos(pitch) * Math.cos(yaw),
    Math.cos(pitch) * Math.sin(yaw),
    Math.sin(pitch),
  ];

  const speed = constants.throwSpeed * power;
  return [
    forward[0] * speed + playerVelocity[0] * 1.25,
    forward[1] * speed + playerVelocity[1] * 1.25,
    forward[2] * speed + playerVelocity[2] * 1.25,
  ];
}

export type SimResult = {
  path: PathSample[];
  /** Where it came to rest or where the fuse ran out. */
  end: [number, number, number];
  /** Bounce points, which is what makes a lineup teachable. */
  bounces: [number, number, number][];
  /** Why it stopped: the fuse, coming to rest, or running out of patience. */
  stopped: "fuse" | "rest" | "timeout";
};

/**
 * Fly a grenade and see where it goes.
 *
 * Semi-implicit Euler with per-step segment collision. Not RK4: the flight is
 * dominated by a constant acceleration, where Euler's error is small and
 * entirely in the vertical, and the thing that actually decides where a
 * grenade ends up is *which triangle it hits first*. Integrator sophistication
 * cannot help with that and a smaller step can, so the step is the knob.
 *
 * @param fuseSeconds when it detonates. Smokes and HE are 1.5s from the throw
 *   in CS2; passing Infinity simulates until it comes to rest, which is what a
 *   molotov does.
 */
export function simulateThrow(
  origin: readonly [number, number, number],
  velocity: readonly [number, number, number],
  world: CollisionIndex,
  fuseSeconds = 1.5,
  constants: ThrowConstants = DEFAULT_CONSTANTS,
): SimResult {
  const g = constants.gravity * constants.gravityScale;
  const path: PathSample[] = [[origin[0], origin[1], origin[2], 0]];
  const bounces: [number, number, number][] = [];

  let pos: [number, number, number] = [origin[0], origin[1], origin[2]];
  let vel: [number, number, number] = [velocity[0], velocity[1], velocity[2]];
  let t = 0;
  let resting = 0;

  while (t < constants.maxSeconds) {
    if (t >= fuseSeconds) {
      return { path, end: pos, bounces, stopped: "fuse" };
    }

    const dt = Math.min(constants.step, fuseSeconds - t);
    vel[2] -= g * dt;

    const next: [number, number, number] = [
      pos[0] + vel[0] * dt,
      pos[1] + vel[1] * dt,
      pos[2] + vel[2] * dt,
    ];

    const hit = world.raycast(pos, next);
    if (hit) {
      bounces.push(hit.point);

      // Split the velocity into the part going into the surface and the part
      // sliding along it. The first is what bounces; the second is what
      // friction takes a bite out of.
      const into = vel[0] * hit.normal[0] + vel[1] * hit.normal[1] + vel[2] * hit.normal[2];
      const normalPart: [number, number, number] = [
        hit.normal[0] * into,
        hit.normal[1] * into,
        hit.normal[2] * into,
      ];
      const slide: [number, number, number] = [
        vel[0] - normalPart[0],
        vel[1] - normalPart[1],
        vel[2] - normalPart[2],
      ];

      vel = [
        slide[0] * (1 - constants.friction) - normalPart[0] * constants.restitution,
        slide[1] * (1 - constants.friction) - normalPart[1] * constants.restitution,
        slide[2] * (1 - constants.friction) - normalPart[2] * constants.restitution,
      ];

      // Nudged off the surface along the normal. Landing exactly on it means
      // the next step starts inside the triangle it just hit, and the ray from
      // there either finds the same triangle again or nothing at all.
      pos = [
        hit.point[0] + hit.normal[0] * 0.1,
        hit.point[1] + hit.normal[1] * 0.1,
        hit.point[2] + hit.normal[2] * 0.1,
      ];

      t += dt * hit.t;
      path.push([pos[0], pos[1], pos[2], t]);

      // Rest is a run of slow *bounces*, and the counter is only ever touched
      // here. Counting slow steps instead would call a lob at its apex
      // stationary; resetting on the free-flight steps between bounces — which
      // is what this did first — means the count can never reach three, because
      // a grenade nudged 0.1 off the floor takes a few steps to fall back and
      // every one of them cleared it. It bounced until the clock ran out and
      // reported "timeout" for a grenade sitting still.
      //
      // Settling is geometric, so this converges quickly: each bounce keeps
      // `restitution` of the last one's speed.
      const speed = Math.hypot(vel[0], vel[1], vel[2]);
      resting = speed < constants.restSpeed ? resting + 1 : 0;
      if (resting >= 3) {
        return { path, end: pos, bounces, stopped: "rest" };
      }

      continue;
    }

    pos = next;
    t += dt;
    path.push([pos[0], pos[1], pos[2], t]);
  }

  return { path, end: pos, bounces, stopped: "timeout" };
}

/**
 * How far a simulation ended from where the real throw did.
 *
 * The number that decides whether the constants above are right. Endpoint
 * rather than average-along-the-path, because the endpoint is what a lineup is
 * *for* — a simulated arc that takes a slightly different route and lands in
 * the same doorway is a success, and one that traces the recording beautifully
 * and lands ten feet short is not.
 */
export function endpointError(simulated: SimResult, recorded: PathSample[]): number | null {
  if (recorded.length < 2) return null;

  const truth = recorded[recorded.length - 1];
  return Math.hypot(simulated.end[0] - truth[0], simulated.end[1] - truth[1], simulated.end[2] - truth[2]);
}

/**
 * Replay a recorded throw through the simulator, from its own start.
 *
 * The recording gives us the release point and, from its first two samples,
 * the velocity it left with — so the simulation starts from measured
 * conditions and the only thing under test is the physics.
 */
export function resimulate(
  recorded: PathSample[],
  world: CollisionIndex,
  fuseSeconds = 1.5,
  constants: ThrowConstants = DEFAULT_CONSTANTS,
): SimResult | null {
  if (recorded.length < 2) return null;

  const [a, b] = recorded;
  const dt = b[3] - a[3];
  if (dt <= 0) return null;

  // Half a gravity-step is added back: the sample at b already includes the
  // gravity applied over that interval, so the velocity *at a* is the
  // difference plus what gravity took away.
  const g = constants.gravity * constants.gravityScale;
  const velocity: [number, number, number] = [
    (b[0] - a[0]) / dt,
    (b[1] - a[1]) / dt,
    (b[2] - a[2]) / dt + (g * dt) / 2,
  ];

  return simulateThrow([a[0], a[1], a[2]], velocity, world, fuseSeconds, constants);
}
