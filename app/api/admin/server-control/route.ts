import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAdminAction } from "@/lib/adminAuth";
import { execOnServer } from "@/lib/tournament/servers";
import {
  actorName,
  append,
  commandRefusal,
  resolveTarget,
} from "@/lib/tournament/console";
import {
  armCommands,
  disarmCommands,
  logSinkUrl,
  tailState,
} from "@/lib/tournament/serverLog";
import {
  detectPlugin,
  isSafeArg,
  modePlan,
  parseStatus,
  parseStatusMap,
  type ModeFamily,
  type PluginKind,
} from "@/lib/serverControl";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The buttons on the Server Control tab, for any one of the fleet.
 *
 * Deliberately not an extension of `/api/admin/action`. That route drives THE
 * server — every one of its handlers goes through `rconExec`, which reads
 * RCON_HOST from the environment, so seven servers and one environment triple
 * means six of them were unreachable from the panel by construction. It also
 * gates on the GardenAdmins ladder alone, which is the bug serverAccess.ts was
 * written to fix. This one takes a server id and asks the same question the
 * console asks, in the same place, so a person who may type `mp_restartgame`
 * into the console may also press the button that sends it.
 *
 * Every action also lands in the shared scrollback. A button that quietly does
 * something a console cannot see is how two admins end up disagreeing about
 * what happened to a server, and the console is right there.
 */

type Body = {
  key?: string;
  serverId?: number;
  type?: string;
  map?: string;
  cfg?: string;
  /** `kickid` target: a userid or a SteamID exactly as `status` printed it. */
  target?: string;
  mode?: string;
  family?: ModeFamily;
  /** What `css_plugins list` said when the UI offered the swap. */
  plugin?: PluginKind;
};

/** Runs one command and puts it, and whatever came back, in the scrollback. */
async function runAndRecord(
  serverId: number,
  who: string,
  command: string,
): Promise<{ ok: boolean; output: string }> {
  let output: string;
  let ok = true;

  try {
    output = (await execOnServer(serverId, command)).trim() || "(no output)";
  } catch (err) {
    output = err instanceof Error ? err.message : String(err);
    ok = false;
  }

  append(serverId, { who, command, output, ok });
  return { ok, output };
}

/**
 * What the server is doing, for the panel header.
 *
 * Three round trips rather than one, and only on demand — the console polls
 * every couple of seconds and this does not. `css_plugins list` is asked for
 * because the mode controls are meaningless without it: offering
 * `css_gamemode` on a box running the tournament plugin produces "Unknown
 * command", which reads from the website exactly like a mode change that
 * worked.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const serverId = Number(url.searchParams.get("serverId")) || undefined;

  const target = await resolveTarget(url.searchParams.get("key"), { serverId });
  if (!target.ok) return NextResponse.json({ error: target.error }, { status: target.status });

  let status = "";
  let statusError: string | null = null;
  try {
    status = await execOnServer(target.serverId, "status");
  } catch (err) {
    statusError = err instanceof Error ? err.message : String(err);
  }

  let plugin: PluginKind = "unknown";
  if (statusError === null) {
    try {
      plugin = detectPlugin(await execOnServer(target.serverId, "css_plugins list"));
    } catch {
      // A server that answered `status` and not this one is reachable but has
      // no CounterStrikeSharp console command — which is "unknown", not an
      // error, and the mode controls say so rather than guessing.
    }
  }

  return NextResponse.json({
    serverId: target.serverId,
    serverName: target.serverName,
    isFullAdmin: target.isFullAdmin,
    online: statusError === null,
    error: statusError,
    map: parseStatusMap(status),
    players: parseStatus(status),
    plugin,
    tail: tailState(target.serverId),
    // Shown so an admin can put it in the server's own autoexec instead of
    // arming it by hand after every restart. Only ever to somebody who has
    // already passed the access check for this server.
    sinkUrl: logSinkUrl(target.serverId),
  });
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
  }

  const target = await resolveTarget(body.key, { serverId: body.serverId });
  if (!target.ok) return NextResponse.json({ error: target.error }, { status: target.status });

  const who = actorName(target.ctx);
  const run = (command: string) => runAndRecord(target.serverId, who, command);

  /**
   * The same reserved-command list the console enforces.
   *
   * A button is not a way around a rule the typed form applies — an organizer
   * who may not type `_restart` may not press a button that sends it either,
   * and routing the check through the same function means there is one list to
   * keep right rather than two that drift.
   */
  const refuse = (command: string) => commandRefusal(command, target.isFullAdmin);

  switch (body.type) {
    case "restart-round": {
      const result = await run("mp_restartgame 1");
      return NextResponse.json({ ok: result.ok, message: result.output });
    }

    case "pause": {
      const result = await run("mp_pause_match");
      return NextResponse.json({ ok: result.ok, message: result.output });
    }

    case "unpause": {
      const result = await run("mp_unpause_match");
      return NextResponse.json({ ok: result.ok, message: result.output });
    }

    // Reload whatever is running, which is the cheapest way to put a server
    // back to a known state without taking the process down.
    case "reload-map": {
      let current: string | null = null;
      try {
        current = parseStatusMap(await execOnServer(target.serverId, "status"));
      } catch {
        current = null;
      }

      if (!current) {
        return NextResponse.json(
          { error: "Could not read which map is running — change to one by name instead." },
          { status: 409 },
        );
      }

      const result = await run(`changelevel ${current}`);
      await logAdminAction(target.ctx, "server.reload-map", undefined, `${target.serverName}: ${current}`);
      return NextResponse.json({ ok: result.ok, message: result.output });
    }

    case "map": {
      const map = (body.map ?? "").trim().toLowerCase();
      if (!isSafeArg(map)) {
        return NextResponse.json({ error: "That is not a map name." }, { status: 400 });
      }

      // `css_gmap` first, then `changelevel`.
      //
      // Not interchangeable: the plugin's own command lets it save state and
      // pick the right mode cfg for the map, and going round it with
      // `changelevel` on a server that has the plugin loses both. But a server
      // with no plugin — or the wrong one — answers "Unknown command" and
      // would simply not change map at all, which is the failure that is worth
      // avoiding here.
      const viaPlugin = await run(`css_gmap ${map}`);
      const unknown = /unknown command/i.test(viaPlugin.output);

      const result = unknown ? await run(`changelevel ${map}`) : viaPlugin;

      await logAdminAction(target.ctx, "server.map", undefined, `${target.serverName}: ${map}`);
      return NextResponse.json({
        ok: result.ok,
        message: unknown
          ? `The plugin does not answer css_gmap here — changed level to ${map} directly.`
          : result.output,
      });
    }

    /**
     * Kick by id, never by name.
     *
     * `css_gkick <name>` takes a display name and matches it partially, which
     * is how you kick the wrong person off a fuzzy list — and it interpolates
     * a player-controlled string into a command line besides. `kickid` takes
     * the engine's own slot number or a SteamID, both of which come from this
     * server's own `status` output and neither of which can contain a `;`.
     */
    case "kick": {
      const id = (body.target ?? "").trim();
      if (!isSafeArg(id)) {
        return NextResponse.json({ error: "That is not a player id." }, { status: 400 });
      }

      const result = await run(`kickid ${id}`);
      await logAdminAction(target.ctx, "server.kick", undefined, `${target.serverName}: ${id}`);
      return NextResponse.json({ ok: result.ok, message: result.output });
    }

    // The cfg escape hatch. Modes ship as cfg files and `exec` is how the rest
    // of this codebase reaches them (see /api/utility/capture-prep), so a mode
    // that has a cfg and no button is still reachable from here.
    case "exec": {
      const cfg = (body.cfg ?? "").trim();
      if (!isSafeArg(cfg)) {
        return NextResponse.json({ error: "That is not a cfg name." }, { status: 400 });
      }

      const refusal = refuse(`exec ${cfg}`);
      if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });

      const result = await run(`exec ${cfg}`);
      await logAdminAction(target.ctx, "server.exec", undefined, `${target.serverName}: ${cfg}`);
      return NextResponse.json({ ok: result.ok, message: result.output });
    }

    /**
     * Change mode, saying honestly which kind of change it is.
     *
     * The plan is computed from what `css_plugins list` said, and the client
     * sends that back rather than the server asking again — so the plan that is
     * carried out is the plan the admin was shown and agreed to, not one
     * recomputed from a fleet that may have moved underneath them.
     */
    case "mode": {
      const mode = (body.mode ?? "").trim().toLowerCase();
      const family: ModeFamily = body.family === "tournament" ? "tournament" : "ladder";

      if (!isSafeArg(mode)) {
        return NextResponse.json({ error: "That is not a mode." }, { status: 400 });
      }

      const plan = modePlan(body.plugin ?? "unknown", family, mode);

      if (plan.kind === "unknown") {
        return NextResponse.json(
          { error: "Nothing answered css_plugins list on that server, so which plugin is loaded is a guess. Read the console first." },
          { status: 409 },
        );
      }

      if (plan.kind === "swap") {
        return NextResponse.json(
          {
            error:
              `${mode} belongs to ${plan.load}, and that server is running ${plan.unload}. ` +
              "Use the plugin swap — it restarts the server.",
          },
          { status: 409 },
        );
      }

      const outputs: string[] = [];
      for (const command of plan.commands) {
        const refusal = refuse(command);
        if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
        outputs.push((await run(command)).output);
      }

      await logAdminAction(target.ctx, "server.mode", undefined, `${target.serverName}: ${mode}`);
      return NextResponse.json({ ok: true, message: outputs.join("\n") });
    }

    /**
     * Swap which plugin the server runs, and tell the database it happened.
     *
     * The row's IsTournament is not decoration: `claimServer` hands tournament
     * matches only to rows that say true, and a box swapped to the tournament
     * plugin while its row still says false is a server that will never be
     * given a match. Doing both together is the point of having this action at
     * all rather than a plugin command and a separate edit that somebody
     * forgets.
     *
     * Full admins only. This takes the server down and changes what the fleet
     * is for, which is not inside "admin powers for the duration of a match".
     */
    case "swap-plugin": {
      if (!target.isFullAdmin) {
        return NextResponse.json(
          { error: "Swapping a plugin is a site-admin action — it restarts the server." },
          { status: 403 },
        );
      }

      const family: ModeFamily = body.family === "tournament" ? "tournament" : "ladder";
      const plan = modePlan(body.plugin ?? "unknown", family, "");

      if (plan.kind !== "swap") {
        return NextResponse.json(
          { error: "That server already runs the plugin for that mode." },
          { status: 409 },
        );
      }

      const outputs: string[] = [];
      for (const command of plan.commands) {
        outputs.push((await run(command)).output);
      }

      await prisma.gameServer.update({
        where: { Id: target.serverId },
        data: { IsTournament: family === "tournament" },
      });

      await logAdminAction(
        target.ctx,
        "server.swap-plugin",
        undefined,
        `${target.serverName}: ${plan.unload} -> ${plan.load}`,
      );

      return NextResponse.json({
        ok: true,
        message:
          `Unloaded ${plan.unload}, loaded ${plan.load}, restarted. ` +
          "Give it a minute and read the console — a swap that did not take says so there.",
        detail: outputs.join("\n"),
      });
    }

    case "restart-server": {
      const refusal = refuse("_restart");
      if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });

      const result = await run("_restart");
      await logAdminAction(target.ctx, "server.restart", undefined, target.serverName);
      return NextResponse.json({ ok: result.ok, message: result.output });
    }

    /**
     * Point the server's log stream at this site.
     *
     * Three separate commands so each reply is readable on its own. A build
     * that does not know `logaddress_add_http` answers "Unknown command" to the
     * first and succeeds at the other two, and the difference between that and
     * a working arm is exactly what the scrollback now shows.
     */
    case "arm-log": {
      const url = logSinkUrl(target.serverId);
      if (!url) {
        return NextResponse.json(
          { error: "SITE_URL and AUTH_SECRET have to be set before a server can be told where to post." },
          { status: 409 },
        );
      }

      for (const command of armCommands(url)) await run(command);
      await logAdminAction(target.ctx, "server.arm-log", undefined, target.serverName);

      return NextResponse.json({
        ok: true,
        message:
          "Armed. Nothing is proven until a line arrives — the tail badge turns live when one does.",
      });
    }

    case "disarm-log": {
      for (const command of disarmCommands()) await run(command);
      await logAdminAction(target.ctx, "server.disarm-log", undefined, target.serverName);
      return NextResponse.json({ ok: true, message: "Stopped asking that server to post its log." });
    }

    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}
