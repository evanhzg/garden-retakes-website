import type { Metadata } from "next";

// Invite links shared on Discord get a proper card. Lobby details live in the
// socket server's memory, so the card is generic by design.
const description = "You've been invited to a game lobby on Garden Retakes. Click to join!";

export const metadata: Metadata = {
  title: "Join my lobby!",
  description,
  openGraph: {
    title: "Join my lobby! — Garden Games",
    description,
    images: [{ url: "/api/og?type=lobby&name=Join%20my%20lobby!", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image" },
};

export default function LobbyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
