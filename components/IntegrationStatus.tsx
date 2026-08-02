"use client";

import { useEffect, useState } from "react";

// Was Tailwind-classed like the page that renders it, which meant no styling at
// all in a project without Tailwind. Same behaviour, site design system.

type Status = "pending" | "processing" | "completed" | "failed" | string;

const NOTE_CLASS: Record<string, string> = {
  completed: "skin-note skin-note-ok",
  failed: "skin-note skin-note-error",
};

export default function IntegrationStatus({ jobId }: { jobId: number | string | null }) {
  const [status, setStatus] = useState<Status>("pending");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/status`);
        if (!res.ok) throw new Error("Failed to fetch status");
        const data = await res.json();
        if (cancelled) return;
        setStatus(data.status);
        if (data.status === "completed" || data.status === "failed") clearInterval(interval);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to fetch status");
      }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [jobId]);

  if (error) {
    return (
      <p className="skin-note skin-note-error" role="alert">
        <span>
          <strong>Failed.</strong> Could not check the job status: {error}
        </span>
      </p>
    );
  }

  const running = status === "pending" || status === "processing";

  return (
    <div aria-live="polite">
      <dl className="skin-kv">
        <dt>Job</dt>
        <dd>
          <code className="skin-path">{jobId ?? "none"}</code>
        </dd>
        <dt>Status</dt>
        <dd>
          <span className={`tag ${status === "failed" ? "tag-outline" : "tag-accent"}`}>{status}</span>
          {running && <span className="live-dot" style={{ marginLeft: 8 }} aria-hidden />}
        </dd>
      </dl>

      {status === "completed" && (
        <p className={NOTE_CLASS.completed} style={{ marginTop: "var(--space-4)" }}>
          <span>
            <strong>Done.</strong> Assets compiled and uploaded to the repository.
          </span>
        </p>
      )}

      {status === "failed" && (
        <p className={NOTE_CLASS.failed} style={{ marginTop: "var(--space-4)" }}>
          <span>
            <strong>Pipeline failed.</strong> The worker could not process this item — check the worker logs.
          </span>
        </p>
      )}
    </div>
  );
}
