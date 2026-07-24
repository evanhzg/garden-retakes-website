import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { exchangeCode, fetchDiscordUser, verifyState } from "@/lib/discord";

export const dynamic = "force-dynamic";

// Discord redirects back here with ?code&state. We verify the signed state,
// exchange the code, fetch the Discord identity, and persist it on the linked
// Steam account's web profile.
export async function GET(request: Request) {
  const origin = process.env.SITE_URL ?? new URL(request.url).origin;
  const params = new URL(request.url).searchParams;

  const verified = verifyState(params.get("state") || undefined);
  const code = params.get("code");
  if (!verified || !code) return NextResponse.redirect(`${origin}/profile?discord=failed`);

  const token = await exchangeCode(origin, code);
  if (!token?.access_token) return NextResponse.redirect(`${origin}/profile?discord=failed`);

  const user = await fetchDiscordUser(token.access_token);
  if (!user) return NextResponse.redirect(`${origin}/profile?discord=failed`);

  try {
    const steamId = BigInt(verified.steamId);
    await prisma.gardenDiscordLink.upsert({
      where: { SteamId: steamId },
      update: { DiscordId: user.id, DiscordName: user.name, DiscordAvatar: user.avatar, LinkedAtUtc: new Date() },
      create: { SteamId: steamId, DiscordId: user.id, DiscordName: user.name, DiscordAvatar: user.avatar, LinkedAtUtc: new Date() },
    });
  } catch {
    return NextResponse.redirect(`${origin}/profile?discord=error`);
  }

  return NextResponse.redirect(`${origin}/profile?discord=linked`);
}
