"use client";

import Link from "next/link";
import React, { useState } from "react";
import IntegrationStatus from "@/components/IntegrationStatus";

// This page was written in Tailwind utility classes, and the project has no
// Tailwind — every one of them resolved to nothing, so the page rendered as
// unstyled HTML. It now uses the same tokens and primitives as the rest of the
// site. The direct .vpk upload that used to live at the bottom moved to
// /admin/skins, because it wrote straight into the game server's content
// directory from an endpoint with no authorization on it.

export default function SkinRequestPage() {
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
        <span className="kicker">Skins</span>
        <h2 style={{ marginTop: "var(--space-2)" }}>Request a custom skin</h2>
        <p className="muted" style={{ maxWidth: "68ch", marginBottom: 0 }}>
          Paste a Steam Workshop URL to start the baking and compilation pipeline. The page pulls the images off
          the workshop listing so you can pick the raw texture map to bake.
        </p>
      </section>

      <section className="panel">
        <h2>Workshop item</h2>
        <form onSubmit={handleScrape}>
          <div className="field" style={{ maxWidth: 640 }}>
            <label htmlFor="workshop-url">Steam Workshop URL</label>
            <input
              id="workshop-url"
              className="input"
              type="url"
              value={workshopUrl}
              onChange={(e) => setWorkshopUrl(e.target.value)}
              placeholder="https://steamcommunity.com/sharedfiles/filedetails/?id=…"
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
                <strong>Failed.</strong> {error}
              </span>
            </p>
          )}
        </div>
      </section>

      {previewImages.length > 0 && !jobId && (
        <section className="panel">
          <h2>Select the texture map</h2>
          <p className="muted" style={{ maxWidth: "68ch" }}>
            These are the images on the workshop page. Pick the raw texture map you want to bake — not the
            rendered preview shot.
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
                  Process this image
                </button>
              </figure>
            ))}
          </div>
        </section>
      )}

      {jobId && (
        <section className="panel">
          <h2>Pipeline</h2>
          <IntegrationStatus jobId={jobId} />
        </section>
      )}

      <section className="panel">
        <h2>Already have a packed VPK?</h2>
        <p style={{ maxWidth: "70ch", fontSize: 14 }}>
          A finish authored locally — Substance plus the CS2 Workshop Tools — skips this pipeline entirely.
          Pack it into a VPK and upload it on{" "}
          <Link href="/admin/skins">the custom skins admin page</Link>, which validates the archive, shows you
          what is inside it, and pushes it to the game server. That page also carries the reference for exactly
          what the VPK has to contain.
        </p>
        <Link className="btn btn-secondary" href="/admin/skins">
          Upload a VPK
        </Link>
      </section>
    </>
  );
}
