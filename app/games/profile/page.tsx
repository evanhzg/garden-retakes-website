import React from "react";
import Link from "next/link";
import { headers } from "next/headers";
import AvatarImage from "@/components/AvatarImage";
// Use the existing getSession utility if available, or fetch from auth API
// We'll assume the session can be retrieved similarly to the main profile
import { prisma } from "@/lib/db";

// Function to fetch session (replicated logic if getSession isn't exported globally)
async function getSession() {
  try {
    const res = await fetch("http://localhost:3000/api/auth/session", {
      headers: { cookie: headers().get("cookie") || "" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.authenticated ? json : null;
  } catch (e) {
    return null;
  }
}

export const dynamic = "force-dynamic";

export default async function GamesProfilePage() {
  const session = await getSession();

  if (!session) {
    return (
      <section className="panel" style={{ textAlign: "center", padding: "4rem 2rem" }}>
        <h2>Your Games Profile</h2>
        <div style={{ marginTop: "1rem" }}>
          <p style={{ marginBottom: "1.5rem", color: "var(--text-dim)" }}>
            Sign in to view your Games stats, rankings, and best memes.
          </p>
          <Link href="/games/login?returnTo=/games/profile" className="btn">
            Sign In
          </Link>
        </div>
      </section>
    );
  }

  // Placeholder fetching for future enhanced stats
  const displayName = session.name || session.steamId || "Player";

  return (
    <div className="games-profile-container">
      {/* Hero Section */}
      <section className="panel" style={{ position: "relative", overflow: "hidden" }}>
        <div 
          className="hero-background" 
          style={{
            position: "absolute", top: 0, left: 0, right: 0, height: "120px",
            background: "linear-gradient(to right, #a855f7, #ec4899)",
            opacity: 0.15, zIndex: 0
          }} 
        />
        <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: "1.5rem", paddingTop: "2rem" }}>
          <div style={{ width: 100, height: 100, borderRadius: "50%", overflow: "hidden", border: "4px solid var(--panel-bg)" }}>
            <AvatarImage steamId={session.steamId!} src={session.avatar} />
          </div>
          <div>
            <h1 style={{ fontSize: "2.5rem", margin: 0, textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}>
              {displayName}
            </h1>
            <p style={{ color: "var(--text-dim)", margin: 0 }}>Games Hub Player</p>
          </div>
        </div>
      </section>

      {/* Grid for placeholders */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1rem", marginTop: "1rem" }}>
        
        <section className="panel">
          <h2>Stats Overview</h2>
          <div className="empty-hint" style={{ marginTop: "1rem" }}>
            <p className="muted">[Placeholder for global games stats (win rate, hours played, total games)]</p>
          </div>
        </section>

        <section className="panel">
          <h2>Game Rankings</h2>
          <div className="empty-hint" style={{ marginTop: "1rem" }}>
            <p className="muted">[Placeholder for rankings in MONOPO7Y, OUNO, Codenames, etc.]</p>
          </div>
        </section>

        <section className="panel">
          <h2>Best Meme</h2>
          <div className="empty-hint" style={{ marginTop: "1rem" }}>
            <p className="muted">[Placeholder for highest rated meme in HASAMEME]</p>
          </div>
        </section>

        <section className="panel">
          <h2>Best Teammates</h2>
          <div className="empty-hint" style={{ marginTop: "1rem" }}>
            <p className="muted">[Placeholder for frequent collaborators and win rates together]</p>
          </div>
        </section>

      </div>
    </div>
  );
}
