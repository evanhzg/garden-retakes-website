import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Garden Retakes",
  description: "Rankings, stats and seasons for the Garden Retakes server",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="logo">
            🌿 Garden Retakes
          </Link>
          <nav>
            <Link href="/">Ladder</Link>
            <Link href="/teams">CR Teams</Link>
            <Link href="/seasons">Seasons</Link>
            <Link href="/inventory">Inventory</Link>
          </nav>
        </header>
        <main className="container">{children}</main>
        <footer className="site-footer">
          Powered by GardenRankings · stats update live from the game server
        </footer>
      </body>
    </html>
  );
}
