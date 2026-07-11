import type { Metadata, Viewport } from "next";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import NavBar from "@/components/NavBar";
import LeftSidebar from "@/components/LeftSidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Garden Retakes",
  description: "Rankings, stats and seasons for the Garden Retakes server",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Find all players with custom avatars
  const publicDir = path.join(process.cwd(), "public");
  let customAvatarIds: string[] = [];
  try {
    const files = fs.readdirSync(publicDir);
    customAvatarIds = files
      .filter((f) => f.endsWith("_pp.png") && f !== "default_pp.png")
      .map((f) => f.replace("_pp.png", ""));
  } catch (e) {
    // ignore
  }

  const profiles = await prisma.playerProfile.findMany({
    where: { SteamId: { in: customAvatarIds.map((id) => BigInt(id)) } },
    select: { SteamId: true, LastKnownName: true },
  });

  const avatarPlayers = profiles.map((p) => ({
    steamId: p.SteamId.toString(),
    name: p.LastKnownName,
    avatarSrc: `/${p.SteamId.toString()}_pp.png`,
  }));

  return (
    <html lang="en">
      <body>
        <div className="bg-orbs" aria-hidden="true">
          <span className="orb orb-1" />
          <span className="orb orb-2" />
          <span className="orb orb-3" />
        </div>
        
        <NavBar avatarPlayers={avatarPlayers} />
        <div className="layout-wrapper">
          <LeftSidebar players={avatarPlayers} />
          <div className="main-content">
            <main className="container">{children}</main>
            <footer className="site-footer">
              Powered by GardenRankings · stats update live from the game server
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
