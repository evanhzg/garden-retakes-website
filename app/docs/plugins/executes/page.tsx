import Link from "next/link";

export const metadata = { title: "Executes Mode" };

export default function ExecutesVitrine() {
  return (
    <div style={{ background: '#f5f5f7', color: '#1d1d1f', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', paddingBottom: '100px' }}>
      {/* Apple-like minimalist nav */}
      <div style={{ background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(20px)', position: 'sticky', top: 0, padding: '15px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 100, borderBottom: '1px solid #ddd' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0 }}>Executes Pro</h2>
        <Link href="/docs" style={{ color: '#0066cc', textDecoration: 'none', fontWeight: 500 }}>Back to Docs</Link>
      </div>

      {/* Hero */}
      <div style={{ textAlign: 'center', padding: '120px 20px' }}>
        <h1 style={{ fontSize: '5rem', fontWeight: 800, letterSpacing: '-0.03em', margin: '0 0 20px' }}>Executes.</h1>
        <h2 style={{ fontSize: '3rem', fontWeight: 600, color: '#86868b', margin: '0 0 40px', letterSpacing: '-0.02em' }}>Flawless site takes, every time.</h2>
        <p style={{ fontSize: '1.5rem', color: '#1d1d1f', maxWidth: '700px', margin: '0 auto', lineHeight: 1.4 }}>
          Experience the most advanced tactical simulation engine ever built for CS2.
        </p>
      </div>

      {/* Massive Image Section */}
      <div style={{ width: '100%', maxWidth: '1200px', margin: '0 auto 120px', padding: '0 40px' }}>
        <div style={{ background: '#000', borderRadius: '40px', padding: '80px', display: 'flex', justifyContent: 'center', overflow: 'hidden', boxShadow: '0 30px 60px rgba(0,0,0,0.15)' }}>
          <img src="/images/modes/executes.jpg" alt="Executes" style={{ width: '300px', filter: 'drop-shadow(0 0 40px rgba(0, 150, 255, 0.6))' }} />
        </div>
      </div>

      {/* Feature grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', maxWidth: '1200px', margin: '0 auto', padding: '0 40px' }}>
        <div style={{ background: '#fff', borderRadius: '30px', padding: '60px', boxShadow: '0 20px 40px rgba(0,0,0,0.05)' }}>
          <h3 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '20px' }}>A15 Bionic Smokes.</h3>
          <p style={{ fontSize: '1.2rem', color: '#86868b' }}>Our servers automatically deploy pro-level utility, letting you focus entirely on your entry pathing and mechanical execution.</p>
        </div>
        <div style={{ background: '#fff', borderRadius: '30px', padding: '60px', boxShadow: '0 20px 40px rgba(0,0,0,0.05)' }}>
          <h3 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '20px' }}>Dynamic Scenarios.</h3>
          <p style={{ fontSize: '1.2rem', color: '#86868b' }}>No two rounds are the same. Face endlessly varying defensive setups, keeping you on your toes.</p>
        </div>
      </div>
    </div>
  );
}
