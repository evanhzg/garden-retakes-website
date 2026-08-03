"use client";

import Link from "next/link";
import { useI18n } from '@/components/I18nProvider';
import { useEffect, useState } from "react";

// Fake commands data
const COMMANDS_DATA = [
  { group: "General", name: "!help", desc: "Shows all available commands." },
  { group: "General", name: "!stats", desc: "Displays your overall performance." },
  { group: "Retakes", name: "!guns", desc: "Opens the weapon selection menu." },
  { group: "Retakes", name: "!elo", desc: "Check your current Retakes Elo." },
  { group: "Executes", name: "!role", desc: "Swap your role between entry, support, and lurk." },
  { group: "Practice", name: "!noclip", desc: "Toggles fly mode in Practice servers." },
  { group: "Practice", name: "!bot", desc: "Spawns a bot at your crosshair." },
  { group: "Practice", name: "!rethrow", desc: "Rethrows your last grenade." },
  { group: "Duels", name: "!challenge", desc: "Challenge a specific player to a 1v1." },
];

export default function CommandsPage() {
    const { t } = useI18n();

  const [search, setSearch] = useState("");
  const [activeGroup, setActiveGroup] = useState("All");

  const groups = ["All", ...Array.from(new Set(COMMANDS_DATA.map(c => c.group)))];

  const filtered = COMMANDS_DATA.filter(c => {
    if (activeGroup !== "All" && c.group !== activeGroup) return false;
    if (search && !c.name.includes(search) && !c.desc.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{ background: '#0a0a0c', color: '#fff', minHeight: '100vh', padding: '60px', fontFamily: 'monospace' }}>
      <Link href="/docs" style={{ color: '#00ffcc', textDecoration: 'none', fontSize: '1.2rem' }}>{t("auto.page._lt_return")}</Link>
      <h1 style={{ fontSize: '4rem', color: '#00ffcc', marginTop: '40px', borderBottom: '2px solid #333', paddingBottom: '20px' }}>{t("auto.page._command_directory")}</h1>
      
      <div style={{ display: 'flex', gap: '40px', marginTop: '40px' }}>
        {/* Scrollspy / Filter sidebar */}
        <div style={{ width: '250px', flexShrink: 0, position: 'sticky', top: '100px', height: 'fit-content' }}>
          <input 
            type="text" 
            placeholder={t("auto.page.search_commands")} 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '12px', background: '#111', border: '1px solid #333', color: '#fff', marginBottom: '20px' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {groups.map(g => (
              <button 
                key={g} 
                onClick={() => setActiveGroup(g)}
                style={{ 
                  textAlign: 'left', padding: '10px', background: activeGroup === g ? '#00ffcc' : '#111', 
                  color: activeGroup === g ? '#000' : '#888', border: 'none', cursor: 'pointer', fontWeight: 'bold' 
                }}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {filtered.map((cmd, i) => (
            <div key={i} style={{ background: '#111', borderLeft: '4px solid #00ffcc', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '1.5rem', color: '#fff', fontWeight: 'bold' }}>{cmd.name}</span>
                <span style={{ background: '#222', padding: '4px 8px', color: '#888', fontSize: '0.9rem' }}>{cmd.group}</span>
              </div>
              <p style={{ color: '#aaa', fontSize: '1.1rem' }}>{cmd.desc}</p>
            </div>
          ))}
          {filtered.length === 0 && <p style={{ color: '#888' }}>{t("auto.page.no_commands_found")}</p>}
        </div>
      </div>
    </div>
  );
}
