import Link from "next/link";
import "../../docs.css"; 

export const metadata = { title: "Executes Mode — Plugins" };

export default function ExecutesVitrine() {
  return (
    <div style={{ width: '100%' }}>
      <Link href="/docs" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--muted)', textDecoration: 'none', marginBottom: '32px', fontWeight: 600 }}>
        <span>←</span> Back to Docs
      </Link>

      {/* Hero Section */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '64px 0', background: 'radial-gradient(circle at center, rgba(37, 99, 235, 0.1), transparent 70%)', borderRadius: '32px', marginBottom: '64px', border: '1px solid var(--border)' }}>
        <img src="/images/modes/executes.jpg" alt="Executes Logo" style={{ width: '160px', height: '160px', borderRadius: '40px', boxShadow: '0 10px 30px rgba(37, 99, 235, 0.3)', marginBottom: '32px', border: '4px solid color-mix(in srgb, var(--panel) 50%, transparent)' }} />
        <h1 style={{ fontSize: '4rem', fontWeight: 900, color: 'var(--text)', marginBottom: '16px', letterSpacing: '-2px' }}>EXECUTES MODE</h1>
        <p style={{ fontSize: '1.4rem', color: 'var(--muted)', maxWidth: '800px', lineHeight: 1.5 }}>
          Master site takes with real-time tactical smoke and flash deployments. Experience the pinnacle of CS2 teamwork.
        </p>
      </div>

      {/* Features Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px', marginBottom: '64px' }}>
        <div style={{ background: 'color-mix(in srgb, var(--panel) 40%, transparent)', padding: '32px', borderRadius: '24px', border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#3b82f6', marginBottom: '12px' }}>Dynamic Scenarios</h3>
          <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>Face a randomized array of defensive setups and offensive utility. Every round is a unique puzzle to solve with your team.</p>
        </div>
        <div style={{ background: 'color-mix(in srgb, var(--panel) 40%, transparent)', padding: '32px', borderRadius: '24px', border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#3b82f6', marginBottom: '12px' }}>Automated Utility</h3>
          <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>The server throws perfectly timed smokes and flashes based on pro-level executes, allowing you to focus purely on pathing and gunfights.</p>
        </div>
        <div style={{ background: 'color-mix(in srgb, var(--panel) 40%, transparent)', padding: '32px', borderRadius: '24px', border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#3b82f6', marginBottom: '12px' }}>Performance Analytics</h3>
          <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>Track your entry success rate, trade efficiency, and site hold capabilities through our comprehensive stats integration.</p>
        </div>
      </div>
    </div>
  );
}
