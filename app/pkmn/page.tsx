"use client";

import dynamic from "next/dynamic";
import { useI18n } from '@/components/I18nProvider';
import { useGameIdentity } from "@/components/games/hooks";

const PhaserGameNoSSR = dynamic(() => import("./PhaserGame"), { ssr: false });

export default function PkmnPage() {
    const { t } = useI18n();

  const steamId = useGameIdentity();

  if (!steamId) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#1a1a1a', color: 'white' }}>
        <p>{t("auto.page.authenticating")}</p>
      </div>
    );
  }

  // Trainers are persistent DB rows keyed by SteamID64 — guests can't play
  if (steamId.startsWith("GUEST_")) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#1a1a1a', color: 'white', textAlign: 'center', padding: 20 }}>
        <div style={{ fontSize: '2.5rem' }}>🎒</div>
        <h2 style={{ margin: 0 }}>{t("auto.page.garden_pkmn_needs_your_trainer")}</h2>
        <p style={{ color: '#aaa', margin: 0 }}>{t("auto.page.your_pok_mon_are_saved_to_your")}</p>
        <a href="/api/auth/steam/login" style={{ background: '#a855f7', color: '#fff', padding: '10px 24px', borderRadius: 8, fontWeight: 700 }}>
          {t("auto.page.sign_in_through_steam")}
                        </a>
      </div>
    );
  }

  return (
    <>
      <PhaserGameNoSSR />
    </>
  );
}
