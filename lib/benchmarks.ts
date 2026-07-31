import fs from "fs";
import path from "path";

/**
 * FACEIT/pro benchmark ladders produced by scripts/demo-ingest.
 *
 * The website never sees a demo. The ingest runs locally and commits a
 * percentile ladder per skill band, which is all that is needed to say "68th
 * percentile for ADR against FACEIT 7-8" — a few tens of KB rather than
 * gigabytes, and no parsing at request time.
 */

export type Ladder = number[];
export type Band = { samples: number; percentiles: Record<string, Ladder> };
export type Benchmark = {
  version: number;
  generatedAt: string;
  ladder: number[];
  bands: Record<string, Band>;
};

const FILE = path.join(process.cwd(), "data", "benchmarks", "faceit.json");

let cache: { at: number; value: Benchmark | null } | null = null;
const TTL_MS = 5 * 60 * 1000;

/** Null when no ingest has run yet — callers fall back to server-only scoring. */
export function loadBenchmark(): Benchmark | null {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  let value: Benchmark | null = null;
  try {
    if (fs.existsSync(FILE)) {
      const parsed = JSON.parse(fs.readFileSync(FILE, "utf8"));
      if (parsed?.bands && Object.keys(parsed.bands).length > 0) value = parsed;
    }
  } catch {
    // A malformed artefact must not take the page down.
  }
  cache = { at: Date.now(), value };
  return value;
}

export function availableBands(b: Benchmark | null): string[] {
  if (!b) return [];
  const order = ["1-2", "3-4", "5-6", "7-8", "9", "10", "pro"];
  return Object.keys(b.bands).sort((x, y) => order.indexOf(x) - order.indexOf(y));
}

/**
 * Percentile of `value` against a band's ladder, interpolated between the
 * stored points so the figure moves smoothly rather than in 5% steps.
 */
export function percentileAgainst(band: Band, metric: string, value: number, ladder: number[]): number | null {
  const points = band.percentiles[metric];
  if (!points || points.length === 0) return null;

  if (value <= points[0]) return ladder[0];
  if (value >= points[points.length - 1]) return ladder[ladder.length - 1];

  for (let i = 1; i < points.length; i++) {
    if (value <= points[i]) {
      const span = points[i] - points[i - 1];
      const frac = span === 0 ? 0 : (value - points[i - 1]) / span;
      return ladder[i - 1] + frac * (ladder[i] - ladder[i - 1]);
    }
  }
  return ladder[ladder.length - 1];
}
