import SpellTakersLobby from "@/components/SpellTakersLobby";

export const metadata = {
  title: "SpellTakers Lobby — Garden Retakes",
  description: "Join the queue, veto maps, draft your class, and prepare for battle in the new SpellTakers gamemode.",
};

export default function SpellTakersPage() {
  return (
    <div className="spelltakers-page">
      <SpellTakersLobby />
    </div>
  );
}
