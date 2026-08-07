"use client";

import { useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import PluginConfigEditor from "@/components/admin/PluginConfigEditor";
import CalibrationDashboard from "@/components/admin/CalibrationDashboard";

export default function SeasonManager({ adminKey }: { adminKey?: string }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const startNewSeason = async () => {
    if (!confirm("Are you sure you want to start a new season? This will lock the previous season and reset ELO for everyone.")) return;
    
    setLoading(true);
    setToast(null);
    try {
      const res = await fetch("/api/admin/rcon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "!season_start", key: adminKey }),
      });
      const data = await res.json();
      if (res.ok) {
        setToast({ ok: true, text: "New season started successfully. Players ELO have been reset." });
      } else {
        setToast({ ok: false, text: data.error ?? "Failed to start season." });
      }
    } catch (e) {
      setToast({ ok: false, text: "Network error." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="adm-season">
      <section style={{ marginBottom: "2rem", padding: "1rem", backgroundColor: "var(--panel-bg)", borderRadius: "8px" }}>
        <h3>Season Lifecycle</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          Manage the active competitive season. Starting a new season will transition the current rankings to history, reset all ELOs according to the calibration rules, and increment the season number.
        </p>
        
        {toast && (
          <div style={{ marginBottom: "1rem", padding: "0.5rem 1rem", borderRadius: "4px", backgroundColor: toast.ok ? "rgba(46, 204, 113, 0.2)" : "rgba(231, 76, 60, 0.2)", color: toast.ok ? "#2ecc71" : "#e74c3c" }}>
            {toast.text}
          </div>
        )}

        <button 
          className="btn btn-primary" 
          onClick={startNewSeason}
          disabled={loading}
          style={{ backgroundColor: "var(--accent-red)", borderColor: "var(--accent-red)" }}
        >
          {loading ? "Starting..." : "Start New Season (Reset ELO)"}
        </button>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h3>Calibration Dashboard</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          View round-by-round hidden ELO progression for all players currently in their 70 placement rounds.
        </p>
        <CalibrationDashboard />
      </section>

      <section>
        <h3>Season Settings</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          Change the season name, number, and tweak ELO calibration settings. 
          Use the 'Ranking & points' target in the plugin config editor below.
        </p>
        <div style={{ border: "1px solid var(--border)", borderRadius: "8px", overflow: "hidden" }}>
          <PluginConfigEditor adminKey={adminKey} />
        </div>
      </section>
    </div>
  );
}
