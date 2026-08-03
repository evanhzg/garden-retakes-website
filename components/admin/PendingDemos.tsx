"use client";
import { useI18n } from '@/components/I18nProvider';

import { useCallback, useEffect, useState } from "react";

// What the highlight pipeline has waiting for it.
//
// Read-only on purpose: the pipeline is the thing that acts on these, and a
// "process now" button here would be a lie — the work happens on whichever
// machine has CS2 and HLAE, not on the server.

type PendingDemo = {
  id: number;
  fileName: string;
  uploader: string;
  uploaderSteamId: string;
  focusSteamId: string | null;
  rounds: string | null;
  bytes: number | null;
  status: string;
  createdAt: string;
};

const mb = (b: number | null) => (b ? `${(b / 1024 / 1024).toFixed(0)} MB` : "—");

export default function PendingDemos({ adminKey }: { adminKey?: string }) {
    const { t } = useI18n();

  const [demos, setDemos] = useState<PendingDemo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(
        `/api/feed/demos/pending${adminKey ? `?key=${encodeURIComponent(adminKey)}` : ""}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not load the queue.");
        setDemos([]);
        return;
      }
      setDemos(json.demos ?? []);
    } catch {
      setError("Could not reach the server.");
      setDemos([]);
    }
  }, [adminKey]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <p className="skin-note skin-note-warn" role="alert">
        <span><strong>{t("auto.pendingdemos.queue_unavailable")}</strong> {error}</span>
      </p>
    );
  }
  if (demos === null) return <p className="muted">{t("auto.pendingdemos.loading")}</p>;

  return (
    <>
      <div className="pro-section-head" style={{ marginBottom: "var(--space-4)" }}>
        <h2 style={{ fontSize: 15 }}>{t("auto.pendingdemos.demos_waiting_for_the_pipeline")}</h2>
        <button className="btn btn-secondary" onClick={load}>{t("auto.pendingdemos.refresh")}</button>
      </div>

      {demos.length === 0 ? (
        <div className="empty-hint">
          <p style={{ margin: 0 }}>{t("auto.pendingdemos.nothing_queued")}</p>
          <p className="muted" style={{ fontSize: 13 }}>
            {t("auto.pendingdemos.demos_uploaded_on_the_feed_app")}
                                </p>
        </div>
      ) : (
        <div className="pro-tablewrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t("auto.pendingdemos.demo")}</th>
                <th scope="col">{t("auto.pendingdemos.uploader")}</th>
                <th scope="col">{t("auto.pendingdemos.wanted")}</th>
                <th scope="col" className="r">{t("auto.pendingdemos.size")}</th>
                <th scope="col">{t("auto.pendingdemos.status")}</th>
              </tr>
            </thead>
            <tbody>
              {demos.map((d) => (
                <tr key={d.id}>
                  <td>
                    <strong>{d.fileName}</strong>
                    <div className="adm-steamid num">
                      {new Date(d.createdAt).toLocaleString()}
                    </div>
                  </td>
                  <td>
                    <a href={`/players/${d.uploaderSteamId}`} className="adm-pname">{d.uploader}</a>
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {d.rounds ? `rounds ${d.rounds}` : "every highlight"}
                    {d.focusSteamId && d.focusSteamId !== d.uploaderSteamId ? ` · player ${d.focusSteamId}` : ""}
                  </td>
                  <td className="r num">{mb(d.bytes)}</td>
                  <td>
                    <span className={`tag ${d.status === "processing" ? "tag-accent" : "tag-neutral"}`}>
                      {d.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="pro-section-note" style={{ marginTop: "var(--space-4)" }}>
        {t("auto.pendingdemos.run")} <code>{t("auto.pendingdemos._run_cmd")}</code> {t("auto.pendingdemos.on_the_machine_with_cs2_to_col")}
                    </p>
    </>
  );
}
