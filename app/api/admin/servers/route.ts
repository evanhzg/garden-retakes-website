import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminContext, logAdminAction } from "@/lib/adminAuth";
import { AdminLevel } from "@/lib/adminImmunity";
import { rconExecOn } from "@/lib/rcon";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The server registry.
//
// Owner-level, not Admin: these rows carry RCON passwords, and RCON is total
// control of a game server. An admin who can restore a round does not
// automatically need the ability to read the credentials for six machines.

type Body = {
  key?: string;
  action?: "add" | "update" | "delete" | "duplicate" | "test" | "seed-from-env" | "release";
  id?: number;
  name?: string;
  host?: string;
  port?: number;
  rconPassword?: string;
  connectAddress?: string;
  gotvAddress?: string;
  status?: string;
  /** Whether this server is for tournaments rather than the public ladder. */
  isTournament?: boolean;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ctx = await getAdminContext(url.searchParams.get("key"));

  if (ctx.level < AdminLevel.Admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const servers = await prisma.gameServer.findMany({ orderBy: { Id: "asc" } });

  return NextResponse.json({
    // The password is never returned, at any level. There is no screen that
    // needs to display one, and a field that is never sent cannot leak.
    servers: servers.map((s) => ({
      id: s.Id,
      name: s.Name,
      host: s.Host,
      port: s.Port,
      connectAddress: s.ConnectAddress,
      gotvAddress: s.GotvAddress,
      status: s.Status,
      currentMatchId: s.CurrentMatchId,
      isTournament: s.IsTournament,
    })),
  });
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
  }

  const ctx = await getAdminContext(body.key);
  if (ctx.level < AdminLevel.Owner) {
    return NextResponse.json({ error: "Owner only — these rows hold RCON passwords." }, { status: 403 });
  }

  switch (body.action) {
    case "seed-from-env": {
      // The one-click first row. Everything on this site has read
      // RCON_HOST/PORT/PASSWORD from the environment until now, so the server
      // that already works should not have to be typed in again from memory.
      const host = process.env.RCON_HOST;
      const password = process.env.RCON_PASSWORD;

      if (!host || !password) {
        return NextResponse.json({ error: "RCON_HOST / RCON_PASSWORD are not set." }, { status: 400 });
      }

      const existing = await prisma.gameServer.findFirst({ where: { Host: host } });
      if (existing) {
        return NextResponse.json({ ok: true, id: existing.Id, alreadyThere: true });
      }

      const server = await prisma.gameServer.create({
        data: {
          Name: "Server 1",
          Host: host,
          Port: Number.parseInt(process.env.RCON_PORT ?? "27015", 10),
          RconPassword: password,
          ConnectAddress: process.env.RETAKES_CONNECT_ADDRESS ?? null,
          // Explicitly NOT a tournament server, against the column's default.
          // The environment's RCON triple is the public LADDER server — it runs
          // R5e-games, not the tournament plugin. Left at the default it sorted
          // first among "tournament" servers and swallowed every Spawn Maker
          // command, answering "Unknown command 'css_t_maker'" from a machine
          // nobody was standing in. Mark a box as tournament-capable by adding
          // it deliberately, not by inheriting a default.
          IsTournament: false,
        },
      });

      await logAdminAction(ctx, "server.seed", undefined, host);
      return NextResponse.json({ ok: true, id: server.Id });
    }

    case "add": {
      const name = (body.name ?? "").trim();
      const host = (body.host ?? "").trim();
      const password = (body.rconPassword ?? "").trim();

      if (!name || !host || !password) {
        return NextResponse.json({ error: "A name, a host and an RCON password are required." }, { status: 400 });
      }

      const server = await prisma.gameServer.create({
        data: {
          Name: name.slice(0, 64),
          Host: host.slice(0, 128),
          Port: body.port ?? 27015,
          RconPassword: password.slice(0, 128),
          ConnectAddress: (body.connectAddress ?? "").trim() || null,
          GotvAddress: (body.gotvAddress ?? "").trim() || null,
        },
      });

      await logAdminAction(ctx, "server.add", undefined, `${name} ${host}`);
      return NextResponse.json({ ok: true, id: server.Id });
    }

    case "update": {
      if (!body.id) return NextResponse.json({ error: "id?" }, { status: 400 });

      await prisma.gameServer.update({
        where: { Id: body.id },
        data: {
          ...(body.name ? { Name: body.name.slice(0, 64) } : {}),
          ...(body.host ? { Host: body.host.slice(0, 128) } : {}),
          ...(body.port ? { Port: body.port } : {}),
          // Only overwritten when a new one is actually supplied, so saving an
          // edited name cannot blank the password.
          ...(body.rconPassword ? { RconPassword: body.rconPassword.slice(0, 128) } : {}),
          ...(body.connectAddress !== undefined ? { ConnectAddress: body.connectAddress || null } : {}),
          ...(body.gotvAddress !== undefined ? { GotvAddress: body.gotvAddress || null } : {}),
          ...(body.status ? { Status: body.status.slice(0, 16) } : {}),
          // There was no way to change this from anywhere, which mattered:
          // seed-from-env forces it false, so a seeded row could never be
          // promoted to a tournament server without editing the database.
          ...(body.isTournament !== undefined ? { IsTournament: body.isTournament } : {}),
        },
      });

      await logAdminAction(ctx, "server.update", undefined, String(body.id));
      return NextResponse.json({ ok: true });
    }

    case "release": {
      if (!body.id) return NextResponse.json({ error: "id?" }, { status: 400 });

      // For a server left marked busy by a match that died. Without this the
      // only fix is a database edit.
      await prisma.gameServer.update({
        where: { Id: body.id },
        data: { Status: "idle", CurrentMatchId: null },
      });

      await logAdminAction(ctx, "server.release", undefined, String(body.id));
      return NextResponse.json({ ok: true });
    }

    case "delete": {
      if (!body.id) return NextResponse.json({ error: "id?" }, { status: 400 });

      // CurrentMatchId is a loose int, not a foreign key, so nothing in the
      // database stops a server being deleted out from under a live match —
      // the match would simply keep pointing at a row that no longer exists.
      // Refusing here is the only place that check can live.
      const doomed = await prisma.gameServer.findUnique({ where: { Id: body.id } });
      if (!doomed) return NextResponse.json({ error: "No such server." }, { status: 404 });
      if (doomed.Status === "busy" || doomed.CurrentMatchId !== null) {
        return NextResponse.json(
          { error: "That server is running a match. Release it first." },
          { status: 409 },
        );
      }

      await prisma.gameServer.delete({ where: { Id: body.id } });
      await logAdminAction(ctx, "server.delete", undefined, String(body.id));

      return NextResponse.json({ ok: true });
    }

    // Copy a server row, password included.
    //
    // This cannot be done from the browser: GET deliberately never returns
    // RconPassword ("a field that is never sent cannot leak"), so a client-side
    // duplicate would produce a server that looks right and cannot be reached.
    // Most of a second server on the same box is identical to the first — the
    // port and the name are usually the whole diff.
    case "duplicate": {
      if (!body.id) return NextResponse.json({ error: "id?" }, { status: 400 });

      const source = await prisma.gameServer.findUnique({ where: { Id: body.id } });
      if (!source) return NextResponse.json({ error: "No such server." }, { status: 404 });

      const created = await prisma.gameServer.create({
        data: {
          Name: `${source.Name} copy`,
          Host: source.Host,
          // Nudged off the original so the copy is not born colliding. It is a
          // guess, not a promise — the point is that it differs.
          Port: source.Port + 10,
          RconPassword: source.RconPassword,
          ConnectAddress: source.ConnectAddress,
          GotvAddress: source.GotvAddress,
          IsTournament: source.IsTournament,
          // A copy has never run anything, whatever the original is doing.
          Status: "idle",
          CurrentMatchId: null,
        },
      });

      await logAdminAction(ctx, "server.duplicate", undefined, `${body.id} -> ${created.Id}`);

      return NextResponse.json({ ok: true, id: created.Id });
    }

    case "test": {
      if (!body.id) return NextResponse.json({ error: "id?" }, { status: 400 });

      const server = await prisma.gameServer.findUnique({ where: { Id: body.id } });
      if (!server) return NextResponse.json({ error: "No such server." }, { status: 404 });

      try {
        // `status` is the cheapest command that proves the whole path: the host
        // resolves, the port is open, and the password is right.
        const reply = await rconExecOn(
          { host: server.Host, port: server.Port, password: server.RconPassword },
          "status",
        );

        const plugin = /R5e Tournament|css_t_/i.test(reply);

        await prisma.gameServer.update({
          where: { Id: server.Id },
          data: { Status: server.CurrentMatchId ? "busy" : "idle" },
        });

        return NextResponse.json({ ok: true, reply: reply.slice(0, 2000), pluginSeen: plugin });
      } catch (err) {
        await prisma.gameServer.update({ where: { Id: server.Id }, data: { Status: "offline" } });
        return NextResponse.json({ ok: false, error: String(err) });
      }
    }

    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}
