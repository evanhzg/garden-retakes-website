import { NextResponse } from "next/server";
import { AdminLevel, getAdminContext } from "@/lib/adminAuth";
import path from "path";

export const runtime = "nodejs";

// The ingest pipeline is plain CommonJS outside the Next build graph, loaded
// with eval('require') so Webpack leaves it alone. That also means Next's file
// tracing can't see it: on a serverless deployment the files aren't in the
// bundle and this require fails. That's expected, not an error — ingest needs a
// writable disk and a steamcmd process, so it only ever works self-hosted.
let jobs: any = null;
let jobsLoadError: string | null = null;
try {
  const req = eval("require");
  jobs = req(path.join(process.cwd(), "scripts/ws-ingest/jobs.js"));
} catch (e) {
  jobsLoadError = (e as Error).message;
}

const UNAVAILABLE =
  "Workshop ingest isn't available on this deployment — it needs the self-hosted server, "
  + "which has a writable disk and steamcmd. Run `node scripts/ws-ingest <id>` locally instead.";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ctx = await getAdminContext(url.searchParams.get("key"));
  if (ctx.level < AdminLevel.Admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // The inventory page polls this every 2s. Answering a capability question
  // with a 500 filled the browser console with errors on every deployment that
  // can't run ingest, so report it as a fact about the deployment instead.
  if (!jobs) {
    return NextResponse.json({
      available: false,
      active: [],
      recent: [],
      error: UNAVAILABLE,
      detail: jobsLoadError,
    });
  }

  return NextResponse.json({
    available: true,
    active: jobs.activeJobs(),
    recent: jobs.listJobs({ limit: 10 }),
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const ctx = await getAdminContext(body.key);
  if (ctx.level < AdminLevel.Admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // A queue request that can't be honoured is a real failure, so this one keeps
  // an error status — 503, since the deployment can't do it, not 500.
  if (!jobs) {
    return NextResponse.json({ error: UNAVAILABLE, detail: jobsLoadError }, { status: 503 });
  }

  if (!body.url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  try {
    const job = jobs.enqueue(body.url);
    return NextResponse.json(job);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
