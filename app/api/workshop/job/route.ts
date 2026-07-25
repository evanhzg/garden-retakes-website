import { NextResponse } from "next/server";
import { AdminLevel, getAdminContext } from "@/lib/adminAuth";
import path from "path";

export const runtime = "nodejs";

let jobs: any = null;
try {
  jobs = require(path.join(process.cwd(), "scripts/ws-ingest/jobs.js"));
} catch (e) {
  console.error("Could not load jobs.js", e);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ctx = await getAdminContext(url.searchParams.get("key"));
  if (ctx.level < AdminLevel.Admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!jobs) {
    return NextResponse.json({ error: "Ingest script not available" }, { status: 500 });
  }

  return NextResponse.json({
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

  if (!jobs) {
    return NextResponse.json({ error: "Ingest script not available" }, { status: 500 });
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
