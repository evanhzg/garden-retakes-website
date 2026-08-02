import { NextResponse } from "next/server";
import { AdminLevel, getAdminContext, logAdminAction } from "@/lib/adminAuth";
import { readSkin, removeFromGameServer, removeSkinFiles, safeVpkName } from "@/lib/customSkins";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(req: Request, { params }: { params: { file: string } }) {
  const ctx = await getAdminContext(new URL(req.url).searchParams.get("key"));
  if (ctx.level < AdminLevel.Admin) {
    return NextResponse.json({ error: "Not authorized to remove skins." }, { status: 403 });
  }

  const file = safeVpkName(decodeURIComponent(params.file));
  if (!file) return NextResponse.json({ error: "Bad file name." }, { status: 400 });

  const record = await readSkin(file);
  if (!record) return NextResponse.json({ error: "No such skin." }, { status: 404 });

  // The server-side copy goes first: if that fails the record stays, so the
  // page still shows a file that is live on the server rather than hiding it.
  const remote = await removeFromGameServer(file);
  await removeSkinFiles(file);

  await logAdminAction(ctx, "skin.delete", undefined, `${file}${remote.ok ? "" : ` (server: ${remote.error})`}`);

  return NextResponse.json({
    ok: true,
    message: remote.ok
      ? `Removed ${file} from the site and the game server.`
      : `Removed ${file} from the site. Game server: ${remote.error}`,
  });
}
