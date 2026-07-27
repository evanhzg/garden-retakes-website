"use client";

import React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function GamesLoginPage() {
  const searchParams = useSearchParams();
  const returnTo = searchParams?.get("returnTo") || "/games";

  return (
    <div className="panel" style={{ maxWidth: 400, margin: "4rem auto", textAlign: "center" }}>
      <h1 style={{ marginBottom: "1rem" }}>Sign in to Games</h1>
      <p style={{ marginBottom: "2rem", color: "var(--text-dim)" }}>
        Choose your preferred sign in method.
      </p>
      
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <a 
          className="btn" 
          href={`/api/auth/steam/login?returnTo=${encodeURIComponent(returnTo)}`}
          style={{ background: "#171a21", color: "white" }}
        >
          Sign in with Steam
        </a>
        <a 
          className="btn" 
          href={`/api/auth/google/login?returnTo=${encodeURIComponent(returnTo)}`}
          style={{ background: "#4285F4", color: "white" }}
        >
          Sign in with Google
        </a>
        <a 
          className="btn" 
          href={`/api/auth/discord/login?returnTo=${encodeURIComponent(returnTo)}`}
          style={{ background: "#5865F2", color: "white" }}
        >
          Sign in with Discord
        </a>
      </div>
      
      <div style={{ marginTop: "2rem" }}>
        <Link href={returnTo} className="muted">
          ← Back
        </Link>
      </div>
    </div>
  );
}
