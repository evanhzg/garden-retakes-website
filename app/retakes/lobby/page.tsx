import { redirect } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

export default function LobbyRedirect() {
  const newLobbyId = uuidv4();
  redirect(`/retakes/lobby/${newLobbyId}`);
}
