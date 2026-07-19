import { getSession } from "@/lib/auth";
import LinkClient from "./LinkClient";

export const dynamic = "force-dynamic";

// pkmn.retakes.fr/link — where a player pairs the standalone game client to
// their website account. Reached either by typing the code shown in-game, or
// by the game opening this URL directly with ?code= prefilled.
export default function PkmnLinkPage({ searchParams }: { searchParams: { code?: string } }) {
  const session = getSession();
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1a1a1a",
        color: "#fff",
        padding: 20,
      }}
    >
      <LinkClient steamId={session?.steamId ?? null} initialCode={searchParams.code ?? ""} />
    </div>
  );
}
