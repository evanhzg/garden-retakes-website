import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { resolveAvatars } from "@/lib/avatars";
import NavBar from "@/components/NavBar";
import PageLoader from "@/components/PageLoader";
import RouteLoader from "@/components/RouteLoader";
import "./globals.css";
import { I18nProvider } from "@/components/I18nProvider";
import SiteFooter from "@/components/SiteFooter";
import { ToastProvider } from "@/components/Toast";
import { resolveLocale, LOCALE_COOKIE } from "@/lib/i18n";

// Modernist: one grotesque carries headings and body, and a mono handles every
// numeric — ELO, K/D, ADR, counters — so figures line up in tabular columns.
const sans = Archivo({
  subsets: ["latin"],
  weight: ["400", "600", "800"],
  variable: "--font-sans-face",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono-face",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://retakes.fr"),
  title: {
    default: "REEEETAKES",
    template: "%s · REEEETAKES",
  },
  description: "Rankings, stats, seasons, inventory and games for the REEEETAKES community",
  icons: {
    icon: "/retakes_logo.ico",
    apple: "/retakes_logo.png",
  },
  openGraph: {
    siteName: "REEEETAKES",
    type: "website",
    locale: "en_US",
    images: [{ url: "/reeeeetakes-embed.png", width: 1200, height: 630, alt: "REEEETAKES" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/reeeeetakes-embed.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#a855f7",
};
import { ThemeProvider } from "@/components/ThemeProvider";
import { cookies, headers } from "next/headers";
import DynamicGridBackground from "@/components/DynamicGridBackground";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = headers();
  // Read once on the server so the first paint is already in the right
  // language — a locale applied after hydration is a visible flash.
  const locale = resolveLocale(cookies().get(LOCALE_COOKIE)?.value, headersList.get("accept-language"));
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

  // The files in public/ still decide *which* players appear here, but the image
  // itself now comes from Steam rather than the local PNG.
  const navAvatars = await resolveAvatars(profiles.map((p) => p.SteamId));

  const avatarPlayers = profiles.map((p) => ({
    steamId: p.SteamId.toString(),
    name: p.LastKnownName,
    avatarSrc: navAvatars[p.SteamId.toString()],
  }));

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable}`}
    >
      <body>
        {/* Applied before first paint so an override does not flash the wrong
            state on load. Mirrors MotionToggle's storage key and attribute. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var m=localStorage.getItem("garden_motion");if(m==="full"||m==="off"){document.documentElement.setAttribute("data-motion",m)}}catch(e){}`,
          }}
        />
        <PageLoader />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <I18nProvider initial={locale}>
        <ToastProvider>
          {/* The three blurred orbs were the last of the old purple/pink wash
              (#ec4899 / #a855f7 / #d946ef) and fought the Modernist ground. */}
          <DynamicGridBackground />
          <RouteLoader />
          <NavBar avatarPlayers={avatarPlayers} host={host} protocol={protocol} />
          <div className="layout-wrapper">
            <div className="main-content">
              <main className="container">{children}</main>
              <SiteFooter serverAddress={process.env.NEXT_PUBLIC_SERVER_ADDRESS ?? "127.0.0.1:27015"} />
            </div>
          </div>
        </ToastProvider>
        </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
