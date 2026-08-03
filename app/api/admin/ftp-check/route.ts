import { NextResponse } from "next/server";
import { Client } from "basic-ftp";
import { Writable } from "node:stream";
import { AdminLevel, getAdminContext } from "@/lib/adminAuth";
import { CONFIG_TARGETS, type ConfigTarget } from "@/lib/pluginConfig";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

// Why the plugin config read fails, step by step.
//
// The same file reads fine from a laptop and returns "501 command needs an
// argument" from a Vercel function, against the same host and the same path.
// Two guesses at the cause have not fixed it, so this stops guessing: it runs
// the FTP conversation one command at a time and reports the server's own reply
// to each, including the full protocol log.
//
// Owner-only, and it never returns credentials — only the commands and what
// came back.

export async function GET(req: Request) {
  const ctx = await getAdminContext(new URL(req.url).searchParams.get("key"));
  if (ctx.level < AdminLevel.Owner) {
    return NextResponse.json({ error: "Owner only." }, { status: 403 });
  }

  const target = (new URL(req.url).searchParams.get("target") ?? "rankings") as ConfigTarget;
  const path = CONFIG_TARGETS[target]?.path;
  if (!path) return NextResponse.json({ error: "unknown target" }, { status: 400 });

  const steps: { step: string; ok: boolean; detail: string }[] = [];
  const protocol: string[] = [];
  const client = new Client(20000);
  // Capture the raw conversation — the answer is almost certainly in it.
  client.ftp.verbose = true;
  const originalLog = client.ftp.log.bind(client.ftp);
  client.ftp.log = (message: string) => {
    // Never echo the PASS line back to a browser.
    protocol.push(/^PASS /i.test(message.trim()) ? "PASS ***" : message);
    originalLog(message);
  };

  const run = async (name: string, fn: () => Promise<unknown>) => {
    try {
      const out = await fn();
      steps.push({ step: name, ok: true, detail: typeof out === "string" ? out.slice(0, 200) : "ok" });
      return true;
    } catch (e) {
      steps.push({ step: name, ok: false, detail: e instanceof Error ? e.message.slice(0, 300) : String(e) });
      return false;
    }
  };

  try {
    await run("access", () =>
      client.access({
        host: process.env.GAMESERVER_FTP_HOST || "",
        port: Number(process.env.GAMESERVER_FTP_PORT || 21),
        user: process.env.GAMESERVER_FTP_USER || "",
        password: process.env.GAMESERVER_FTP_PASSWORD || "",
        secure: /^(1|true|yes)$/i.test(process.env.GAMESERVER_FTP_SECURE || ""),
      })
    );

    await run("pwd", () => client.pwd());
    await run("features", async () => (await client.features()).size + " features advertised");

    const dir = path.slice(0, path.lastIndexOf("/")) || "/";
    const file = path.slice(path.lastIndexOf("/") + 1);

    await run(`list ${dir}`, async () => (await client.list(dir)).map((f) => f.name).join(", "));
    await run(`size ${path}`, () => client.size(path));

    await run(`download absolute ${path}`, async () => {
      const sink = new Writable({ write: (_c, _e, cb) => cb() });
      await client.downloadTo(sink, path);
      return "read";
    });

    await run(`cd ${dir}`, () => client.cd(dir));
    await run(`download relative ${file}`, async () => {
      const sink = new Writable({ write: (_c, _e, cb) => cb() });
      await client.downloadTo(sink, file);
      return "read";
    });
  } finally {
    client.close();
  }

  return NextResponse.json({
    target,
    path,
    host: process.env.GAMESERVER_FTP_HOST ?? null,
    secure: /^(1|true|yes)$/i.test(process.env.GAMESERVER_FTP_SECURE || ""),
    steps,
    // Last 60 lines is plenty; the failure is at the end.
    protocol: protocol.slice(-60),
  });
}
