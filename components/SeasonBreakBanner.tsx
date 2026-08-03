"use client";

import { useEffect, useState } from "react";
import { isFrozen, freezeDate, type FreezePoll } from "@/lib/seasonFreeze";
import { useI18n } from "@/components/I18nProvider";
import Link from "next/link";

export default function SeasonBreakBanner() {
  const { t, locale } = useI18n();
  const [poll, setPoll] = useState<FreezePoll | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/vote")
      .then((res) => res.json())
      .then((data) => {
        setPoll(data.poll);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading || !poll) return null;

  if (isFrozen(poll)) {
    const dateStr = poll.closesAt ? freezeDate(poll.closesAt, locale) : "";
    const bannerText = t("season.break.banner.frozen", { date: dateStr, link: "LINK_PLACEHOLDER" });
    const parts = bannerText.split("LINK_PLACEHOLDER");
    
    return (
      <div className="gr-pop" style={{ padding: "12px 16px", marginBottom: 24, borderRadius: 8, background: "var(--color-accent-900)", color: "var(--color-accent)", display: "flex", gap: 12, alignItems: "center" }}>
        <span>❄️</span>
        <p style={{ margin: 0 }}>
          {parts.map((part, i) => (
            <span key={i}>
              {part}
              {i < parts.length - 1 && (
                <Link href="/#vote" style={{ color: "var(--color-accent)", textDecoration: "underline" }}>
                  Garden
                </Link>
              )}
            </span>
          ))}
        </p>
      </div>
    );
  }

  // If closesAt has passed but not frozen
  if (poll.closesAt && new Date(poll.closesAt).getTime() < Date.now()) {
    return (
      <div className="gr-pop" style={{ padding: "12px 16px", marginBottom: 24, borderRadius: 8, background: "var(--color-bg-2)", display: "flex", gap: 12, alignItems: "center" }}>
        <span>⏱️</span>
        <p style={{ margin: 0 }}>{t("season.break.banner.soon")}</p>
      </div>
    );
  }

  return null;
}
