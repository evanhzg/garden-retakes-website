"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Copy, RotateCcw } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import "./system.css";

/**
 * A page that threw.
 *
 * Without this, an exception in any server component took the whole page to a
 * blank screen with nothing to do. This keeps the site's rail and footer (it
 * renders inside the layout), offers a retry — most failures here are the
 * database or a Steam call timing out — and shows the digest, which is the one
 * thing that finds the matching line in the Vercel logs.
 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    console.error(error);
  }, [error]);

  const ref = error.digest ?? "";

  return (
    <div className="sys">
      <div className="sys-hero">
        <span className="sys-code num" aria-hidden>!</span>
        <div>
          <span className="kicker">{t("sys.error.kicker")}</span>
          <h1 className="sys-title">{t("sys.error.title")}</h1>
          <p className="sys-lede">{t("sys.error.lede")}</p>
          <div className="sys-actions">
            <button type="button" className="btn btn-primary" onClick={() => reset()}>
              <RotateCcw size={16} /> {t("sys.error.retry")}
            </button>
            <Link className="btn btn-secondary" href="/">
              {t("sys.home")}
            </Link>
          </div>
          {ref && (
            <p className="sys-ref">
              {t("sys.error.ref")} <code className="num">{ref}</code>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() =>
                  navigator.clipboard
                    .writeText(ref)
                    .then(() => {
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1500);
                    })
                    .catch(() => {})
                }
              >
                <Copy size={13} /> {copied ? t("sys.copied") : t("sys.copy")}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
