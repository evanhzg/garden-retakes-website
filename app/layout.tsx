import type { Metadata, Viewport } from "next";
import NavBar from "@/components/NavBar";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="bg-orbs" aria-hidden="true">
          <span className="orb orb-1" />
          <span className="orb orb-2" />
          <span className="orb orb-3" />
        </div>
        <NavBar />
        <main className="container">{children}</main>
        <footer className="site-footer">
          Powered by GardenRankings · stats update live from the game server
        </footer>
      </body>
    </html>
  );
}
