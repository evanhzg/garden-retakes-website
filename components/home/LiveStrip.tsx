"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import type { StatusReport } from "@/lib/status";

/**
 * One line: is the public server up, and who is on it.
 *
 * Fetched after load from /api/status rather than awaited by the page — an A2S
 * query to a server that is down takes its whole timeout, and the homepage
 * should never wait on a game server to render.
 */
export default function LiveStrip() {
  const { t } = useI18n();
  const [report, setReport] = useState<StatusReport | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/status")
        .then((r) => r.json())
        .then((d: StatusReport) => alive && d?.servers && setReport(d))
        .catch(() => {});
    void load();
    const h = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.clearInterval(h);
    };
  }, []);

  if (!report) return <span className="cn-live pending" aria-hidden />;

  const pub = report.servers.find((s) => s.kind === "public") ?? report.servers[0];
  const busy = report.servers.filter((s) => s.match).length;

  return (
    <Link href="/status" className={`cn-live ${pub?.health ?? "unknown"}`}>
      <span className="cn-live-dot" aria-hidden />
      {pub?.live ? (
        <span>
          {t("circuit.liveOn", {
            n: Math.max(0, pub.live.players - pub.live.bots),
            max: pub.live.maxPlayers,
            map: pub.live.map.replace(/^(de|cs)_/, ""),
          })}
        </span>
      ) : (
        <span>{pub?.health === "down" ? t("circuit.serverDown") : t("circuit.serverOk")}</span>
      )}
      {busy > 0 && <span className="cn-live-busy">· {t("circuit.matchesLive", { n: busy })}</span>}
    </Link>
  );
}
