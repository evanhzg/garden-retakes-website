import { getSession } from "@/lib/auth";
import { AdminLevel, getAdminContext } from "@/lib/adminAuth";
import FeedClient from "@/components/feed/FeedClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Feed — clips and CS2 updates",
  description: "Community clips from the server, and every CS2 patch as Valve ships it.",
};

export default async function FeedPage() {
  const ctx = await getAdminContext(null);
  return <FeedClient signedIn={Boolean(getSession())} isAdmin={ctx.level >= AdminLevel.Moderator} />;
}
