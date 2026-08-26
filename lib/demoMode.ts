import { prisma } from "@/lib/db";

/**
 * Is the site running as a demo?
 *
 * Demo mode is a single row in `GardenSchedulerState`, toggled by an owner from
 * the admin overview. It shapes what the site *offers*: the nav is cut to
 * Tournaments and Stats, the footer is gone, and /stats serves the tournament
 * boards instead of the ladder's season boards.
 *
 * It is not an access control. Every other page still answers on its own URL
 * for anyone who types one — nothing here is secret, it is simply not on
 * offer. If a demo ever needs the stronger version, this is the predicate to
 * gate those routes on.
 */
export async function isDemoMode(): Promise<boolean> {
  try {
    const row = await prisma.gardenSchedulerState.findUnique({ where: { Key: "DemoMode" } });
    return row?.Value === "true";
  } catch {
    // A database blip must not turn the whole site into a demo, so the
    // failure direction is "not a demo".
    return false;
  }
}
