"use client";

import Link from "next/link";
import React, { useState } from "react";
import { useI18n } from '@/components/I18nProvider';
import IntegrationStatus from "@/components/IntegrationStatus";

// This page was written in Tailwind utility classes, and the project has no
// Tailwind — every one of them resolved to nothing, so the page rendered as
// unstyled HTML. It now uses the same tokens and primitives as the rest of the
// site. The direct .vpk upload that used to live at the bottom moved to
// /admin/skins, because it wrote straight into the game server's content
// directory from an endpoint with no authorization on it.

export default function SkinRequestPage() {
    const { t } = useI18n();

  const [workshopUrl, setWorkshopUrl] = useState("");
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [jobId, setJobId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleScrape = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/scrape-workshop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workshopUrl }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch workshop data");

      setPreviewImages(data.imageUrls ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitJob = async (imageUrl: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workshopUrl, imageUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit job");

      setJobId(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <section className="panel">
        <span className="kicker">{t("auto.page.skins")}</span>
        <h2 style={{ marginTop: "var(--space-2)" }}>{t("auto.page.request_a_custom_skin")}</h2>
        <p className="muted" style={{ maxWidth: "68ch", marginBottom: 0 }}>
          {t("auto.page.paste_a_steam_workshop_url_to")}
                          </p>
      </section>

      <section className="panel">
        <h2>{t("auto.page.workshop_item")}</h2>
        <form onSubmit={handleScrape}>
          <div className="field" style={{ maxWidth: 640 }}>
            <label htmlFor="workshop-url">{t("auto.page.steam_workshop_url")}</label>
            <input
              id="workshop-url"
              className="input"
              type="url"
              value={workshopUrl}
              onChange={(e) => setWorkshopUrl(e.target.value)}
              placeholder={t("auto.page.https_steamcommunity_com_share")}
              required
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: "var(--space-4)" }}>
            {loading ? "Scanning…" : "Scan workshop"}
          </button>
        </form>

        <div aria-live="assertive" role="alert">
          {error && (
            <p className="skin-note skin-note-error" style={{ marginTop: "var(--space-4)" }}>
              <span>
                <strong>{t("auto.page.failed")}</strong> {error}
              </span>
            </p>
          )}
        </div>
      </section>

      {previewImages.length > 0 && !jobId && (
        <section className="panel">
          <h2>{t("auto.page.select_the_texture_map")}</h2>
          <p className="muted" style={{ maxWidth: "68ch" }}>
            {t("auto.page.these_are_the_images_on_the_wo")}
                                </p>

          <div className="card-grid">
            {previewImages.map((url, i) => (
              <figure key={url} className="item-card" style={{ margin: 0 }}>
                {/* Remote workshop CDN images, so a plain img rather than next/image. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Workshop image ${i + 1}`} />
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  disabled={loading}
                  onClick={() => handleSubmitJob(url)}
                >
                  {t("auto.page.process_this_image")}
                                        </button>
              </figure>
            ))}
          </div>
        </section>
      )}

      {jobId && (
        <section className="panel">
          <h2>{t("auto.page.pipeline")}</h2>
          <IntegrationStatus jobId={jobId} />
        </section>
      )}

      <section className="panel">
        <h2>{t("auto.page.already_have_a_packed_vpk")}</h2>
        <p style={{ maxWidth: "70ch", fontSize: 14 }}>
          {t("auto.page.a_finish_authored_locally_subs")}{" "}
          <Link href="/admin/skins">{t("auto.page.the_custom_skins_admin_page")}</Link>{t("auto.page._which_validates_the_archive_s")}
                          </p>
        <Link className="btn btn-secondary" href="/admin/skins">
          {t("auto.page.upload_a_vpk")}
                          </Link>
      </section>
    </>
  );
}
