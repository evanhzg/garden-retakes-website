"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from '@/components/I18nProvider';
import { formatDistanceToNow } from "date-fns";

type ClipRequest = {
  id: number;
  map: string;
  sessionId: string;
  durationSec: number;
  status: string;
  note: string | null;
  clipId: number | null;
  createdAt: string;
};

export default function ClipRequestsModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [requests, setRequests] = useState<ClipRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);

    const scroller = document.querySelector<HTMLElement>(".main-content");
    const previous = scroller?.style.overflow ?? "";
    if (scroller) scroller.style.overflow = "hidden";

    fetch("/api/feed/clip-requests")
      .then((res) => res.json())
      .then((data) => {
        if (data.requests) setRequests(data.requests);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    return () => {
      window.removeEventListener("keydown", onKey);
      if (scroller) scroller.style.overflow = previous;
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="pro-modal" role="dialog" aria-modal="true" aria-labelledby="clip-requests-title" onClick={onClose}>
      <div className="pro-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <div className="pro-modal-head">
          <h2 id="clip-requests-title">Your /clip Requests</h2>
          <button className="btn btn-secondary" onClick={onClose}>{t("auto.uploadclipmodal.close")}</button>
        </div>
        <div className="pro-panel" style={{ padding: 0, minHeight: 100 }}>
          {loading ? (
            <div style={{ padding: 20, textAlign: "center" }}>Loading...</div>
          ) : requests.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center" }} className="muted">No clip requests found. Use /clip in-game!</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: "var(--color-divider)", borderRadius: "inherit", overflow: "hidden" }}>
              {requests.map((req) => (
                <div key={req.id} style={{ padding: "16px 20px", background: "var(--color-surface)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>
                      {req.map}
                    </div>
                    <div className="muted" style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
                      <span>{req.status === "pending" ? "Waiting to be processed" : req.status === "processing" ? "Processing..." : req.status === "done" ? "Ready" : req.status}</span>
                      <span>&bull;</span>
                      <span>{formatDistanceToNow(new Date(req.createdAt), { addSuffix: true })}</span>
                    </div>
                  </div>
                  {req.status === "done" && req.clipId ? (
                    <button className="btn btn-primary" style={{ fontSize: 13, padding: "6px 12px" }}>
                      Publish
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
