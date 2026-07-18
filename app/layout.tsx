import type { Metadata, Viewport } from "next";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import NavBar from "@/components/NavBar";
import LeftSidebar from "@/components/LeftSidebar";
import PageLoader from "@/components/PageLoader";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://retakes.fr"),
  title: {
    default: "Garden Retakes",
    template: "%s · Garden Retakes",
  },
  description: "Rankings, stats, seasons, inventory and games for the Garden Retakes server",
  openGraph: {
    siteName: "Garden Retakes",
    type: "website",
    locale: "en_US",
    images: [{ url: "/api/og", width: 1200, height: 630, alt: "Garden Retakes" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/api/og"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#a855f7",
};
import { ThemeProvider } from "@/components/ThemeProvider";
import { headers } from "next/headers";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = headers();
  const host = headersList.get("host") || "retakes.fr";
  const protocol = headersList.get("x-forwarded-proto") || "https";
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
    <html lang="en" suppressHydrationWarning>
      <body>
        <PageLoader />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <div className="bg-orbs" aria-hidden="true">
            <span className="orb orb-1" />
            <span className="orb orb-2" />
            <span className="orb orb-3" />
          </div>
          
          <NavBar avatarPlayers={avatarPlayers} host={host} protocol={protocol} />
          <div className="layout-wrapper">
            <LeftSidebar players={avatarPlayers} host={host} protocol={protocol} />
            <div className="main-content">
              <main className="container">{children}</main>
              <footer className="site-footer">
                Powered by GardenRankings · stats update live from the game server
              </footer>
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
