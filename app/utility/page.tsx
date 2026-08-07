import { getSession } from "@/lib/auth";
import UtilityPage from "@/components/utility/UtilityClient";

export const dynamic = "force-dynamic";

// In the nav now. The whole site is unlisted, so noindex stays as the thing
// actually keeping it private rather than the absence of a link.
export const metadata = {
  title: "Utility — lineups",
  description: "Smokes, flashes and mollies with exact positions, on every map in the pool.",
  robots: { index: false, follow: false },
};

export default function Page() {
  const session = getSession();
  return (
    <>
      <UtilityPage signedIn={Boolean(session)} />
    </>
  );
}
