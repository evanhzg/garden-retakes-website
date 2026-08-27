import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Serving a tournament's banner.
//
// Public and unauthenticated on purpose: it is the picture on a card that
// anybody can see. The card markup only asks for this URL when the tournament
// has a banner, so a 404 here means somebody typed it.

export async function GET(
  _req: Request,
  { params }: { params: { slug: string } },
) {
  const tournament = await prisma.tournament.findUnique({
    where: { Slug: params.slug },
    select: { BannerImage: true, BannerMime: true, Published: true },
  });

  if (!tournament?.BannerImage) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(tournament.BannerImage), {
    headers: {
      "Content-Type": tournament.BannerMime ?? "image/png",
      // Long, because the URL changes only when the slug does and a banner is
      // replaced perhaps twice in an event's life. must-revalidate would put a
      // request on every card render for an image that almost never changes.
      //
      // Private for an unpublished tournament: a shared cache in front of this
      // must not hold a draft event's artwork where the next visitor gets it.
      "Cache-Control": tournament.Published
        ? "public, max-age=3600, stale-while-revalidate=86400"
        : "private, no-store",
    },
  });
}
