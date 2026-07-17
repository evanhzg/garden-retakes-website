import type { Metadata } from "next";

const description =
  "Play UNO, Monopoly, Codenames, Cards Against, Make it Meme and Skribbl with friends — universal lobbies, bots and chat.";

export const metadata: Metadata = {
  title: "Games Hub",
  description,
  openGraph: {
    title: "Games Hub — Garden Retakes",
    description,
    images: [
      {
        url: `/api/og?${new URLSearchParams({
          type: "page",
          title: "Games Hub",
          desc: "Six multiplayer party games, one universal lobby. Bring your friends.",
          icon: "🎮",
        })}`,
        width: 1200,
        height: 630,
      },
    ],
  },
  twitter: { card: "summary_large_image" },
};

export default function GamesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
