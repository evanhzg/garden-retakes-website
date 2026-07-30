import Link from "next/link";
import "../../docs.css"; 

export const metadata = { title: "Ranked Retakes — Plugins" };

export default function RetakesVitrine() {
  return (
    <div style={{ width: '100%' }}>
      <Link href="/docs" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--muted)', textDecoration: 'none', marginBottom: '32px', fontWeight: 600 }}>
        <span>←</span> Back to Docs
      </Link>

      {/* Hero Section */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '64px 0', background: 'radial-gradient(circle at center, rgba(236, 72, 153, 0.1), transparent 70%)', borderRadius: '32px', marginBottom: '64px', border: '1px solid var(--border)' }}>
        <img src="/images/modes/retakes.jpg" alt="Retakes Logo" style={{ width: '160px', height: '160px', borderRadius: '40px', boxShadow: '0 10px 30px rgba(236, 72, 153, 0.3)', marginBottom: '32px', border: '4px solid color-mix(in srgb, var(--panel) 50%, transparent)' }} />
        <h1 style={{ fontSize: '4rem', fontWeight: 900, color: 'var(--text)', marginBottom: '16px', letterSpacing: '-2px' }}>RANKED RETAKES</h1>
        <p style={{ fontSize: '1.4rem', color: 'var(--muted)', maxWidth: '800px', lineHeight: 1.5 }}>
          The gold standard for CS2 post-plant practice. Featuring a robust Elo system, dynamic loadouts, and seasonal leaderboards.
        </p>
      </div>

      {/* Features Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px', marginBottom: '64px' }}>
        <div style={{ background: 'color-mix(in srgb, var(--panel) 40%, transparent)', padding: '32px', borderRadius: '24px', border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ec4899', marginBottom: '12px' }}>True Skill Elo</h3>
          <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>Matchmaking rating that actually reflects your impact. Win clutches, secure trades, and climb the ladder to prove your worth.</p>
        </div>
        <div style={{ background: 'color-mix(in srgb, var(--panel) 40%, transparent)', padding: '32px', borderRadius: '24px', border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ec4899', marginBottom: '12px' }}>Smart Allocator</h3>
          <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>Fair weapon distribution based on real CS2 economy logic. Set your preferences via the sleek in-game web menu or chat commands.</p>
        </div>
        <div style={{ background: 'color-mix(in srgb, var(--panel) 40%, transparent)', padding: '32px', borderRadius: '24px', border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ec4899', marginBottom: '12px' }}>Web Integration</h3>
          <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>Every kill, death, and clutch is instantly synced to retakes.fr. Analyze your performance across detailed heatmaps and charts.</p>
        </div>
      </div>
    </div>
  );
}
