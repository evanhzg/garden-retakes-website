"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Pass the API sections as a prop if needed, or just list them here.
export default function DocsOverview({ apiSections }: { apiSections: any[] }) {
  const [activeTab, setActiveTab] = useState("General");
  const router = useRouter();

  const tabs = ["General", "Website", "API"];
  const gameModes = [
    { id: "retakes", name: "Ranked Retakes", logo: "/images/modes/retakes.jpg", desc: "The competitive retakes mode with elo and leaderboards." },
    { id: "executes", name: "Executes", logo: "/images/modes/executes.jpg", desc: "Coordinated site takes with tactical smoke and flash deployments." },
    { id: "practice", name: "Practice", logo: "/images/modes/practice.jpg", desc: "Nade lineups, prefire paths, and ultimate sandbox tools." },
    { id: "duels", name: "Duels", logo: "/images/modes/duels.jpg", desc: "Intense 1v1 and 2v2 arenas to settle the score." },
    { id: "commands", name: "Commands", logo: "/images/modes/practice.jpg", desc: "Comprehensive searchable directory of all plugin commands." }
  ];

  return (
    <div style={{ width: '100%' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <h1 style={{ fontSize: '3.5rem', fontWeight: 900, color: 'var(--text)', marginBottom: '16px', letterSpacing: '-1px' }}>REEEETAKES Docs</h1>
        <p style={{ fontSize: '1.25rem', color: 'var(--muted)', maxWidth: '800px', margin: '0 auto', lineHeight: 1.6 }}>
          The central hub for all technical documentation, website guides, and CS2 plugin references.
        </p>
      </div>

      {/* Main Tabs */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '48px', flexWrap: 'wrap' }}>
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              position: 'relative',
              padding: '12px 32px',
              fontSize: '1.1rem',
              fontWeight: 700,
              background: activeTab === tab ? 'var(--accent-soft)' : 'color-mix(in srgb, var(--panel) 40%, transparent)',
              color: activeTab === tab ? 'var(--accent)' : 'var(--text)',
              border: '1px solid color-mix(in srgb, var(--border) 40%, transparent)',
              borderRadius: '999px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              boxShadow: activeTab === tab ? 'var(--shadow)' : 'none'
            }}
          >
            {activeTab === tab && (
              <motion.div layoutId="docsTabBubble" style={{ position: 'absolute', inset: 0, borderRadius: '999px', border: '2px solid var(--accent)', pointerEvents: 'none' }} />
            )}
            <span style={{ position: 'relative', zIndex: 1 }}>{tab}</span>
          </button>
        ))}
      </div>

      <div style={{ background: 'color-mix(in srgb, var(--panel) 60%, transparent)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid var(--border)', borderRadius: '24px', padding: '48px', boxShadow: 'var(--shadow-hover)', minHeight: '400px' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === "General" && (
              <div>
                <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '24px', color: 'var(--text)' }}>Game Modes & Plugins</h2>
                <p style={{ color: 'var(--muted)', fontSize: '1.1rem', marginBottom: '32px' }}>
                  Explore the dedicated vitrine pages for our custom CS2 plugins and game modes.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
                  {gameModes.map(mode => (
                    <Link href={`/docs/plugins/${mode.id}`} key={mode.id} style={{ textDecoration: 'none' }}>
                      <div style={{ 
                        background: 'color-mix(in srgb, var(--bg-soft) 80%, transparent)', 
                        border: '1px solid var(--border)', 
                        borderRadius: '20px', 
                        padding: '24px', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        textAlign: 'center',
                        transition: 'transform 0.2s, boxShadow 0.2s',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = 'var(--shadow-hover)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                      >
                        <img src={mode.logo} alt={mode.name} style={{ width: '120px', height: '120px', borderRadius: '24px', marginBottom: '20px', objectFit: 'cover', boxShadow: 'var(--shadow)' }} />
                        <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent)', marginBottom: '12px' }}>{mode.name}</h3>
                        <p style={{ color: 'var(--muted)', fontSize: '0.95rem', lineHeight: 1.5 }}>{mode.desc}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "Website" && (
              <div>
                <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '24px', color: 'var(--text)' }}>Website Architecture</h2>
                <div style={{ color: 'var(--text)', fontSize: '1.1rem', lineHeight: 1.7 }}>
                  <p style={{ marginBottom: '16px' }}>The REEEETAKES website is a Next.js application that integrates real-time server data, player statistics, and custom mini-games into a single unified platform.</p>
                  <ul style={{ listStyleType: 'disc', paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '12px', color: 'var(--muted)' }}>
                    <li><strong style={{ color: 'var(--text)' }}>Real-time CS2 Sync:</strong> Live matches broadcast events to the website via WebSockets, instantly updating ladders and live scoreboards.</li>
                    <li><strong style={{ color: 'var(--text)' }}>Framer Motion UI:</strong> Extensive use of smooth, hardware-accelerated animations for a premium user experience.</li>
                    <li><strong style={{ color: 'var(--text)' }}>Games Hub:</strong> Houses isolated, full-screen interactive experiences that bypass the standard site layout (e.g., Pokémon, CS2 Board Editor).</li>
                  </ul>
                </div>
              </div>
            )}

            {activeTab === "API" && (
              <div>
                <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '24px', color: 'var(--text)' }}>API Reference</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                  {apiSections?.map((s) => (
                    <Link key={s.slug} href={`/docs/${s.slug}`} style={{ textDecoration: 'none' }}>
                      <div style={{ 
                        padding: '24px', 
                        background: 'color-mix(in srgb, var(--bg-soft) 50%, transparent)', 
                        border: '1px solid var(--border)', 
                        borderRadius: '16px',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-soft)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'color-mix(in srgb, var(--bg-soft) 50%, transparent)'; }}
                      >
                        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)', marginBottom: '8px' }}>{s.title}</h3>
                        <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginBottom: '16px' }}>{s.intro.length > 100 ? s.intro.slice(0, 97) + "..." : s.intro}</p>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, background: 'var(--accent)', color: '#fff', padding: '4px 10px', borderRadius: '999px' }}>
                          {s.endpoints ? `${s.endpoints.length} ENDPOINTS` : `${s.socketEvents?.length ?? 0} EVENTS`}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
