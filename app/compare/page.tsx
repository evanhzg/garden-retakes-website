import { redirect } from "next/navigation";

// The compare tool moved to /stats/compare — old links (Discord bot embeds,
// bookmarks, profile buttons) land here, so forward them with their params.
export default function CompareRedirect({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") params.set(key, value);
  }
  const qs = params.toString();
  redirect(`/stats/compare${qs ? `?${qs}` : ""}`);
}
