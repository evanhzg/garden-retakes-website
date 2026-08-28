import { PrismaClient } from "@prisma/client";

// One Prisma client, holding as few database connections as it can.
//
// This used to be `new PrismaClient()` with the global cache skipped in
// production, and it took the site down: MySQL answered
// `ERROR 1040 (08004): Too many connections` 64 times in a day, across `/`,
// `/lobby/[id]`, `/api/players/resolve`, `/api/live` and `/api/notifications` —
// every route a lobby polls. The site looked dead and needed a redeploy to come
// back, which worked only because redeploying drops every warm lambda and with
// them every connection they were holding.
//
// Two things caused it, and both are specific to running on serverless.
//
// Prisma's default pool is `cpus * 2 + 1` connections PER CLIENT. On Vercel
// every concurrently warm lambda is its own process with its own client, so the
// fleet-wide total is that number times however many instances are up — which
// scales with traffic, exactly when the database can least afford it. A
// serverless function serves one request at a time and needs precisely one
// connection, so it is pinned to one below.
//
// And the cache was guarded by `NODE_ENV !== "production"`, which is the
// received wisdom for Next dev servers — it stops hot reload leaking a client
// per edit — but on a warm lambda it means nothing is ever reused between
// module evaluations. Cached in both now: the dev reason still holds, and in
// production it can only help.

/**
 * The connection string, with a serverless-sized pool.
 *
 * Written here rather than in the environment so the limit cannot go missing
 * when somebody adds a variable in a dashboard — and an explicit
 * `connection_limit` already in the URL still wins, so it stays overridable.
 *
 * `pool_timeout` is raised from the 10s default: when every connection is busy,
 * waiting is better than the 500 that this whole comment is about.
 */
function serverlessUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;

  try {
    const url = new URL(raw);
    if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "1");
    if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "20");
    return url.toString();
  } catch {
    // A URL Node cannot parse is one Prisma should be given untouched, so it
    // reports the real problem rather than one this function invented.
    return raw;
  }
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: serverlessUrl() } },
  });

globalForPrisma.prisma = prisma;

export async function getActiveSeason() {
  return prisma.season.findFirst({ where: { IsActive: true } });
}
