import { getSession } from "@/lib/auth";
import RetakesLobby from "@/components/retakes/RetakesLobby";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Competitive — matchmaking",
  description: "Queue 2v2 or 3v3 Blitz with a proper map veto.",
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const session = getSession();
  const resolvedParams = await params;
  return (
    <>
      <RetakesLobby signedIn={Boolean(session)} lobbyId={resolvedParams.id} />
    </>
  );
}
