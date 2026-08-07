import { getSession } from "@/lib/auth";
import RetakeLoadout from "@/components/retakes/RetakeLoadout";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Retakes loadout",
  description: "Your role, the guns you want on each buy, and which utility you would rather carry.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <RetakeLoadout signedIn={Boolean(getSession())} />;
}
