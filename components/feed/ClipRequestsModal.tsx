"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from '@/components/I18nProvider';

type ClipRequest = {
  id: string;
  mapName: string;
  kills: number;
  weapons: string[];
  team: "T" | "CT";
  date: string;
};

const MOCK_REQUESTS: ClipRequest[] = [
  { id: "1", mapName: "Mirage", kills: 4, weapons: ["AK-47", "Desert Eagle"], team: "T", date: "2 mins ago" },
  { id: "2", mapName: "Inferno", kills: 3, weapons: ["AWP"], team: "CT", date: "15 mins ago" },
  { id: "3", mapName: "Nuke", kills: 5, weapons: ["M4A4"], team: "CT", date: "1 hour ago" },
  { id: "4", mapName: "Dust II", kills: 4, weapons: ["Galil AR", "AK-47"], team: "T", date: "3 hours ago" },
  { id: "5", mapName: "Overpass", kills: 3, weapons: ["USP-S"], team: "CT", date: "5 hours ago" },
];

export default function ClipRequestsModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);

    const scroller = document.querySelector<HTMLElement>(".main-content");
    const previous = scroller?.style.overflow ?? "";
    if (scroller) scroller.style.overflow = "hidden";

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
        <div className="pro-panel" style={{ padding: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: "var(--color-divider)", borderRadius: "inherit", overflow: "hidden" }}>
            {MOCK_REQUESTS.map((req) => (
              <div key={req.id} style={{ padding: "16px 20px", background: "var(--color-surface)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>
                    {req.mapName} · {req.kills}K ({req.team})
                  </div>
                  <div className="muted" style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
                    <span>{req.weapons.join(", ")}</span>
                    <span>&bull;</span>
                    <span>{req.date}</span>
                  </div>
                </div>
                <button className="btn btn-primary" style={{ fontSize: 13, padding: "6px 12px" }}>
                  Publish
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
