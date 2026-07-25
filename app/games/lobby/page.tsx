import { redirect } from "next/navigation";

// /lobby with no id is meaningless — send people back to the hub.
export default function LobbyIndex() {
  redirect("/games");
}
