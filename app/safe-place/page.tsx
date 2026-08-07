import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import SafePlaceClient from "./SafePlaceClient";

export default async function SafePlacePage() {
  const session = getSession();
  let hasAccess = false;

  if (session) {
    const steamId = BigInt(session.steamId);
    const status = await prisma.gardenSafeStatus.findUnique({ where: { SteamId: steamId } });
    if (status) {
       hasAccess = status.Status === "ACTIVE" || status.Status === "PROBING";
    }
  }

  return <SafePlaceClient loggedIn={!!session} hasAccess={hasAccess} />;
}
