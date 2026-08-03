import { getSession } from "@/lib/auth";
import UtilityPage from "@/components/utility/UtilityClient";

export const dynamic = "force-dynamic";

// Unlisted for now: reachable at /utility, deliberately not in the nav, and
// asked not to be indexed while the lineup library is still being filled in.
export const metadata = {
  title: "Utility — lineups",
  description: "Smokes, flashes and mollies with exact positions, on every map in the pool.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <UtilityPage signedIn={Boolean(getSession())} />;
}
