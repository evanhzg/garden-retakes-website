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

  return (
    <SocketProvider steamId={steamId}>
      <PhaserGameNoSSR />
    </SocketProvider>
  );
}
