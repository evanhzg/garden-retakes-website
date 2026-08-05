import { getSession } from "@/lib/auth";
import { SocketProvider } from "@/components/games/SocketProvider";
import RetakesLobby from "@/components/retakes/RetakesLobby";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Competitive — matchmaking",
  description: "Queue 2v2 or 3v3 competitive retakes with a proper map veto.",
  robots: { index: false, follow: false },
};

export default function Page() {
  const session = getSession();
  return (
    <SocketProvider steamId={session?.steamId}>
      <RetakesLobby signedIn={Boolean(session)} />
    </SocketProvider>
  );
}
