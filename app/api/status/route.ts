import { NextResponse } from "next/server";
import { statusReport } from "@/lib/status";

export const dynamic = "force-dynamic";
// UDP (A2S) needs the Node runtime.
export const runtime = "nodejs";

/** The status report as JSON — for the page's auto-refresh, and for anything else that wants it. */
export async function GET() {
  const report = await statusReport();
  return NextResponse.json(report, {
    status: report.health === "down" ? 503 : 200,
    headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" },
  });
}
