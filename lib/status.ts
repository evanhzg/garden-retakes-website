/**
 * Is everything up? — the data behind /status and /api/status.
 *
 * Each check asks the thing itself rather than a flag somebody sets: the
 * database is sent a query, the socket server its health route, and every game
 * server an A2S query over UDP — the same question a CS2 client asks before it
 * connects (lib/a2s.ts). The tournament system's own record of each server
 * (GameServer.Status) is shown beside the live answer, because the two
 * disagreeing is exactly the case worth seeing.
 *
 * If NO server answers at all, that is more likely this host being unable to
 * send UDP than every server being down at once, so the rows fall back to the
 * recorded state and say so instead of painting the page red.
 *
 * Memoised for 15 seconds per instance: a status page that queries six game
 * servers per visitor is a way to be the reason they are slow.
 */
import { prisma } from "@/lib/db";
import { info as a2sInfo } from "@/lib/a2s";

export type Health = "ok" | "degraded" | "down" | "unknown";

export type ComponentStatus = {
  id: string;
  health: Health;
  latencyMs: number | null;
  detail?: string;
};

export type ServerStatus = {
  id: string;
  name: string;
  address: string;
  kind: "public" | "tournament";
  health: Health;
  /** From the live A2S answer; null when it did not answer. */
  live: { map: string; players: number; maxPlayers: number; bots: number; latencyMs: number } | null;
  /** What the tournament system has recorded (idle | busy | offline), when it tracks this server. */
  recorded: string | null;
  match: { id: number; slug: string; label: string } | null;
};

export type StatusReport = {
  health: Health;
  checkedAt: string;
  version: string | null;
  components: ComponentStatus[];
  servers: ServerStatus[];
  /** False when no server answered A2S — see the note above. */
  liveQueries: boolean;
};

let memo: { at: number; report: StatusReport } | null = null;
const TTL_MS = 15_000;

const timed = async <T>(fn: () => Promise<T>): Promise<{ value: T | null; ms: number; error: unknown }> => {
  const start = Date.now();
  try {
    const value = await fn();
    return { value, ms: Date.now() - start, error: null };
  } catch (error) {
    return { value: null, ms: Date.now() - start, error };
  }
};

function splitAddress(raw: string, fallbackPort = 27015): { host: string; port: number } | null {
  const cleaned = raw.trim().replace(/^connect\s+/i, "").replace(/;.*$/, "");
  const m = /^([A-Za-z0-9.-]+)(?::(\d{2,5}))?$/.exec(cleaned);
  if (!m) return null;
  return { host: m[1], port: m[2] ? Number(m[2]) : fallbackPort };
}

async function checkDatabase(): Promise<ComponentStatus> {
  const r = await timed(() => prisma.$queryRawUnsafe("SELECT 1"));
  if (r.error) return { id: "database", health: "down", latencyMs: null };
  return { id: "database", health: r.ms > 1500 ? "degraded" : "ok", latencyMs: r.ms };
}

async function checkSocket(): Promise<ComponentStatus> {
  const base = process.env.NEXT_PUBLIC_SOCKET_URL;
  if (!base) return { id: "matchmaking", health: "unknown", latencyMs: null };
  const r = await timed(async () => {
    const res = await fetch(`${base.replace(/\/$/, "")}/discord/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(String(res.status));
    return true;
  });
  if (r.error) return { id: "matchmaking", health: "down", latencyMs: null };
  return { id: "matchmaking", health: r.ms > 2000 ? "degraded" : "ok", latencyMs: r.ms };
}

async function queryServer(host: string, port: number) {
  const r = await timed(() => a2sInfo(host, port, 2500));
  if (!r.value) return null;
  return {
    map: r.value.map,
    players: r.value.players,
    maxPlayers: r.value.maxPlayers,
    bots: r.value.bots,
    latencyMs: r.ms,
  };
}

async function buildReport(): Promise<StatusReport> {
  const publicAddress = process.env.NEXT_PUBLIC_SERVER_ADDRESS || "play.retakes.fr:27015";

  const [database, socket, rows] = await Promise.all([
    checkDatabase(),
    checkSocket(),
    prisma.gameServer
      .findMany({
        where: { Status: { not: "disabled" } },
        // Never RconPassword — this is a public page.
        select: { Id: true, Name: true, Host: true, Port: true, ConnectAddress: true, Status: true, CurrentMatchId: true },
        orderBy: { Id: "asc" },
      })
      .catch(() => []),
  ]);

  // Matches in progress, for a link from the server row.
  const matchIds = rows.map((r) => r.CurrentMatchId).filter((x): x is number => !!x);
  const matches = matchIds.length
    ? await prisma.tournamentMatch
        .findMany({
          where: { Id: { in: matchIds } },
          select: { Id: true, TeamAId: true, TeamBId: true, Tournament: { select: { Slug: true, Name: true, Published: true } } },
        })
        .catch(() => [])
    : [];
  const teamIds = matches.flatMap((m) => [m.TeamAId, m.TeamBId]).filter((x): x is number => !!x);
  const teams = teamIds.length
    ? await prisma.tournamentTeam.findMany({ where: { Id: { in: teamIds } }, select: { Id: true, Name: true } }).catch(() => [])
    : [];
  const teamName = (id: number | null) => teams.find((t) => t.Id === id)?.Name ?? "TBD";

  type Target = Omit<ServerStatus, "health" | "live"> & { host: string; port: number };
  const targets: Target[] = [];
  const pub = splitAddress(publicAddress);
  if (pub) {
    targets.push({
      id: "public",
      name: "Retakes",
      address: `${pub.host}:${pub.port}`,
      kind: "public",
      recorded: null,
      match: null,
      ...pub,
    });
  }
  for (const row of rows) {
    const addr = splitAddress(row.ConnectAddress || `${row.Host}:${row.Port}`, row.Port);
    if (!addr) continue;
    const address = `${addr.host}:${addr.port}`;
    if (targets.some((t) => t.address === address)) continue;
    const m = matches.find((x) => x.Id === row.CurrentMatchId && x.Tournament.Published);
    targets.push({
      id: `gs-${row.Id}`,
      name: row.Name,
      address,
      kind: "tournament",
      recorded: row.Status,
      match: m ? { id: m.Id, slug: m.Tournament.Slug, label: `${teamName(m.TeamAId)} vs ${teamName(m.TeamBId)}` } : null,
      ...addr,
    });
  }

  const answers = await Promise.all(targets.map((t) => queryServer(t.host, t.port)));
  const liveQueries = answers.some(Boolean);

  const servers: ServerStatus[] = targets.map(({ host: _h, port: _p, ...t }, i) => {
    const live = answers[i];
    let health: Health;
    if (live) health = "ok";
    else if (!liveQueries) health = t.recorded === "offline" ? "down" : t.recorded ? "ok" : "unknown";
    else health = "down";
    return { ...t, live, health };
  });

  const components: ComponentStatus[] = [{ id: "website", health: "ok", latencyMs: null }, database, socket];

  const all = [...components.map((c) => c.health), ...servers.map((s) => s.health)];
  const health: Health =
    database.health === "down"
      ? "down"
      : all.some((h) => h === "down" || h === "degraded")
        ? "degraded"
        : "ok";

  return {
    health,
    checkedAt: new Date().toISOString(),
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    components,
    servers,
    liveQueries,
  };
}

export async function statusReport(): Promise<StatusReport> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.report;
  const report = await buildReport();
  memo = { at: Date.now(), report };
  return report;
}
