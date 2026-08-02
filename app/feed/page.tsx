import { getSession } from "@/lib/auth";
import FeedClient from "@/components/feed/FeedClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Feed — clips and CS2 updates",
  description: "Community clips from the server, and every CS2 patch as Valve ships it.",
};

export default function FeedPage() {
  return <FeedClient signedIn={Boolean(getSession())} />;
}
