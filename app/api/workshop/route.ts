import { NextResponse } from "next/server";
import { AdminLevel, getAdminContext, logAdminAction } from "@/lib/adminAuth";
import { addWorkshopSkin, listWorkshopSkins, WorkshopIngestError } from "@/lib/workshop";

export const dynamic = "force-dynamic";

/** The catalogue, optionally narrowed to one weapon. Readable by anyone. */
export async function GET(request: Request) {
  const def = new URL(request.url).searchParams.get("def");
  const skins = listWorkshopSkins();
  const filtered = def ? skins.filter((s) => String(s.def) === def) : skins;
  return NextResponse.json({ count: filtered.length, skins: filtered });
}

/**
 * Add a skin from a Workshop link or id.
 *
 * Admin-gated: it writes into the repo and queues a change that the next deploy
 * pushes to the game server.
 */
export async function POST(request: Request) {
  const key = new URL(request.url).searchParams.get("key");
  const admin = await getAdminContext(key);
  if (admin.level < AdminLevel.Admin) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  let input = "";
  try {
    const body = await request.json();
    input = String(body?.input ?? body?.url ?? body?.id ?? "");
  } catch {
    return NextResponse.json({ error: "Expected a JSON body with an `input` field." }, { status: 400 });
  }

  try {
    const { skin, created } = await addWorkshopSkin(input);
    await logAdminAction(
      admin,
      created ? "workshopAdd" : "workshopRefresh",
      { name: skin.name },
      `${skin.workshopId} · ${skin.weapon ?? "unknown weapon"}`
    );
    return NextResponse.json({ skin, created });
  } catch (err) {
    if (err instanceof WorkshopIngestError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: (err as Error).message || "Ingest failed." }, { status: 500 });
  }
}
