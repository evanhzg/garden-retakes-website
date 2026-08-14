import { getSession } from "@/lib/auth";
import { getLoadoutIcons } from "@/lib/economy";
import RetakeLoadout from "@/components/retakes/RetakeLoadout";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Retakes loadout",
  description: "Your role, the guns you want on each buy, and which utility you would rather carry.",
  robots: { index: false, follow: false },
};

export default function Page() {
  // Resolved here, on the server, from the same item catalog the inventory uses:
  // the page then renders with its icons already in hand.
  return <RetakeLoadout signedIn={Boolean(getSession())} icons={getLoadoutIcons()} />;
}
