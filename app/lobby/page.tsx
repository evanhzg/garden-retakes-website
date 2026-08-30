import { redirect } from "next/navigation";
import { newLobbyId } from "@/lib/lobbyId";

export const dynamic = "force-dynamic";

export default function LobbyRedirect() {
  redirect(`/lobby/${newLobbyId()}`);
}
