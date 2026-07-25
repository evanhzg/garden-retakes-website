import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { exchangeCode, fetchGoogleUser, verifyState } from "@/lib/google";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = process.env.SITE_URL ?? new URL(request.url).origin;
  const params = new URL(request.url).searchParams;

  const verified = verifyState(params.get("state") || undefined);
  const code = params.get("code");
  if (!verified || !code) return NextResponse.redirect(`${origin}/profile?google=failed`);

  const token = await exchangeCode(origin, code);
  if (!token?.access_token) return NextResponse.redirect(`${origin}/profile?google=failed`);

  const user = await fetchGoogleUser(token.access_token);
  if (!user) return NextResponse.redirect(`${origin}/profile?google=failed`);

  const payload = verified.steamId;

  if (payload.startsWith("login|")) {
    const returnTo = payload.split("|")[1] || "/";
    
    // Standalone login
    const link = await prisma.gardenGoogleLink.findFirst({
      where: { GoogleId: user.id },
      orderBy: { LinkedAtUtc: 'desc' }
    });

    let steamIdToUse: bigint;
    
    if (link) {
      steamIdToUse = link.SteamId;
    } else {
      steamIdToUse = BigInt("99" + Math.floor(Math.random() * 1000000000000000).toString().padStart(15, '0'));
      
      await prisma.playerProfile.create({
        data: {
          SteamId: steamIdToUse,
          LastKnownName: user.name,
          FirstSeenAtUtc: new Date(),
          LastSeenAtUtc: new Date()
        }
      });
      
      await prisma.gardenGoogleLink.create({
        data: { SteamId: steamIdToUse, GoogleId: user.id, GoogleEmail: user.email, GoogleName: user.name, GoogleAvatar: user.avatar, LinkedAtUtc: new Date() }
      });
    }
    
    const sessionToken = createSessionToken({ steamId: steamIdToUse.toString(), name: user.name, avatar: user.avatar || undefined });
    const response = NextResponse.redirect(`${origin}${returnTo}`);
    response.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions);
    return response;
  }

  try {
    const steamId = BigInt(payload);
    await prisma.gardenGoogleLink.upsert({
      where: { SteamId: steamId },
      update: { GoogleId: user.id, GoogleEmail: user.email, GoogleName: user.name, GoogleAvatar: user.avatar, LinkedAtUtc: new Date() },
      create: { SteamId: steamId, GoogleId: user.id, GoogleEmail: user.email, GoogleName: user.name, GoogleAvatar: user.avatar, LinkedAtUtc: new Date() },
    });
  } catch {
    return NextResponse.redirect(`${origin}/profile?google=error`);
  }

  return NextResponse.redirect(`${origin}/profile?google=linked`);
}
