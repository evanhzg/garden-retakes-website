"use client";

import dynamic from "next/dynamic";
import { SocketProvider } from "@/components/games/SocketProvider";
import { useGameIdentity } from "@/components/games/hooks";

const PhaserGameNoSSR = dynamic(() => import("./PhaserGame"), { ssr: false });

export default function PkmnPage() {
  const steamId = useGameIdentity();

  if (!steamId) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#1a1a1a', color: 'white' }}>
        <p>Authenticating...</p>
      </div>
    );
  }

  // Trainers are persistent DB rows keyed by SteamID64 — guests can't play
  if (steamId.startsWith("GUEST_")) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#1a1a1a', color: 'white', textAlign: 'center', padding: 20 }}>
        <div style={{ fontSize: '2.5rem' }}>🎒</div>
        <h2 style={{ margin: 0 }}>Garden PKMN needs your trainer card</h2>
        <p style={{ color: '#aaa', margin: 0 }}>Your Pokémon are saved to your Steam account — sign in to start your journey.</p>
        <a href="/api/auth/steam/login" style={{ background: '#a855f7', color: '#fff', padding: '10px 24px', borderRadius: 8, fontWeight: 700 }}>
          Sign in through Steam
        </a>
      </div>
    );
  }

  return (
    <SocketProvider steamId={steamId}>
      <PhaserGameNoSSR />
    </SocketProvider>
  );
}
