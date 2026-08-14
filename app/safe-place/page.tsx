import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import SafePlaceClient from "./SafePlaceClient";

export type SafeStatusKind = "PROBING" | "ACTIVE" | "REJECTED" | "BANNED" | "NONE";

export type SafeStatusProps = {
  status: SafeStatusKind;
  safeScore: number;
  toxicityScore: number;
  teamplayScore: number;
  commScore: number;
} | null;

export default async function SafePlacePage() {
  const session = getSession();
  let hasAccess = false;
  let safeStatus: SafeStatusProps = null;
  let pendingRequest = false;
  let memberCount = 0;

  if (session) {
    const steamId = BigInt(session.steamId);
    const [status, pending] = await Promise.all([
      prisma.gardenSafeStatus.findUnique({ where: { SteamId: steamId } }),
      prisma.gardenSafeRequest.findFirst({ where: { SteamId: steamId, Status: "PENDING" } }),
    ]);

    if (status) {
      hasAccess = status.Status === "ACTIVE" || status.Status === "PROBING";
      safeStatus = {
        status: status.Status as SafeStatusKind,
        safeScore: status.SafeScore,
        toxicityScore: status.ToxicityScore,
        teamplayScore: status.TeamplayScore,
        commScore: status.CommScore,
      };
    }
    pendingRequest = !!pending;
  }

  // Shown even to a logged-out visitor — "how many people are already in
  // here" is exactly the kind of number that makes a gate feel worth asking
  // to join, rather than an abstract policy.
  memberCount = await prisma.gardenSafeStatus.count({ where: { Status: "ACTIVE" } });

  return (
    <SafePlaceClient
      loggedIn={!!session}
      hasAccess={hasAccess}
      safeStatus={safeStatus}
      pendingRequest={pendingRequest}
      memberCount={memberCount}
    />
  );
}
