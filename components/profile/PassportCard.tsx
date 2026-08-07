"use client";
import React from "react";

const BACKGROUNDS = [
  { id: "green", url: "/backgrounds/passport_bg_green.jpg", label: "Green Landscape" },
  { id: "blue", url: "/backgrounds/passport_bg_blue.jpg", label: "Blue Peaks" },
  { id: "purple", url: "/backgrounds/passport_bg_purple.jpg", label: "Purple Valley" },
  { id: "orange", url: "/backgrounds/passport_bg_orange.jpg", label: "Sunset Horizon" },
];

export default function PassportCard({ passport, avatar, stats }: { passport: any, avatar: string, stats: any }) {
  if (!passport) return null;

  return (
    <div style={{
      width: "100%", maxWidth: "480px", margin: "0 auto 32px auto",
      background: "var(--color-background-elevated, #111)", borderRadius: "16px", overflow: "hidden",
      border: "1px solid var(--color-divider)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)"
    }}>
      {/* Background Top Half */}
      <div style={{ 
        height: "160px", width: "100%",
        backgroundImage: `url(${BACKGROUNDS.find(b => b.id === passport.BackgroundId)?.url || BACKGROUNDS[0].url})`,
        backgroundSize: "cover", backgroundPosition: "center"
      }} />
      
      {/* Profile Picture */}
      <div style={{ 
        position: "relative",
        marginTop: "-50px", marginLeft: "24px",
        width: "100px", height: "100px",
        borderRadius: "12px", border: "4px solid var(--color-background-elevated, #111)",
        backgroundImage: `url(${avatar})`, backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat"
      }} />

      {/* Passport Content */}
      <div style={{ padding: "16px 24px 24px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ margin: "0", fontSize: "24px", fontWeight: "bold" }}>{passport.Username}</h2>
            <p style={{ margin: "4px 0 0 0", color: "var(--color-text-muted)" }}>
              {passport.Role} • {passport.Age} Y/O • {passport.Country}
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "12px", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "1px" }}>Rating</div>
            <div style={{ fontSize: "24px", fontWeight: "bold", color: "var(--color-accent)" }}>
              {stats.rating || "N/A"}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "8px" }}>
          <div style={{ background: "rgba(255,255,255,0.05)", padding: "12px", borderRadius: "8px" }}>
            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>2v2 Winrate</div>
            <div style={{ fontSize: "18px", fontWeight: "bold" }}>{stats.winrate2v2}%</div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.05)", padding: "12px", borderRadius: "8px" }}>
            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>3v3 Winrate</div>
            <div style={{ fontSize: "18px", fontWeight: "bold" }}>{stats.winrate3v3}%</div>
          </div>
        </div>

        <div style={{ background: "rgba(255,255,255,0.05)", padding: "12px", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "11px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Best Teammate</div>
          <div style={{ fontSize: "14px", fontWeight: "bold" }}>{stats.bestTeammate || "N/A"}</div>
        </div>
      </div>
    </div>
  );
}
