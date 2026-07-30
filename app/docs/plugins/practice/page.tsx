import Link from "next/link";

export const metadata = { title: "Practice Mode" };

export default function PracticeVitrine() {
  return (
    <div style={{ background: '#0a192f', color: '#64ffda', minHeight: '100vh', fontFamily: 'SF Mono, Fira Code, monospace', padding: '40px', backgroundImage: 'radial-gradient(rgba(100,255,218,0.1) 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '60px', borderBottom: '1px solid rgba(100,255,218,0.3)', paddingBottom: '20px' }}>
        <h2 style={{ margin: 0, letterSpacing: '2px' }}>[ TACTICAL_HUD_V2.0 ]</h2>
        <Link href="/docs" style={{ color: '#64ffda', textDecoration: 'none', border: '1px solid #64ffda', padding: '8px 16px' }}>ABORT</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '40px', alignItems: 'center', maxWidth: '1200px', margin: '0 auto' }}>
        
        {/* HUD Elements */}
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: -10, left: -10, width: 20, height: 20, borderTop: '2px solid #64ffda', borderLeft: '2px solid #64ffda' }} />
          <div style={{ position: 'absolute', top: -10, right: -10, width: 20, height: 20, borderTop: '2px solid #64ffda', borderRight: '2px solid #64ffda' }} />
          <div style={{ position: 'absolute', bottom: -10, left: -10, width: 20, height: 20, borderBottom: '2px solid #64ffda', borderLeft: '2px solid #64ffda' }} />
          <div style={{ position: 'absolute', bottom: -10, right: -10, width: 20, height: 20, borderBottom: '2px solid #64ffda', borderRight: '2px solid #64ffda' }} />
          
          <img src="/images/modes/practice.jpg" alt="Practice" style={{ width: '100%', display: 'block', opacity: 0.8 }} />
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(10, 25, 47, 0.4)', mixBlendMode: 'color' }} />
        </div>

        <div>
          <h1 style={{ fontSize: '4rem', margin: '0 0 20px', textShadow: '0 0 10px rgba(100,255,218,0.5)' }}>PRACTICE.SYS</h1>
          <p style={{ fontSize: '1.2rem', color: '#8892b0', lineHeight: 1.8, marginBottom: '40px' }}>
            > Initializing sandbox environment...<br/>
            > Loading NadeBook databases... OK<br/>
            > Booting prefire paths... OK<br/>
            Master your utility and movement with surgical precision in the ultimate offline-style trainer, now hosted in a multiplayer environment.
          </p>

          <div style={{ background: 'rgba(100,255,218,0.05)', border: '1px solid rgba(100,255,218,0.2)', padding: '20px' }}>
            <h3 style={{ margin: '0 0 15px', color: '#ccd6f6' }}>> ESSENTIAL_COMMANDS</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', color: '#8892b0', fontSize: '0.9rem' }}>
              <div><span style={{ color: '#64ffda' }}>.bot</span> - Spawns a target dummy</div>
              <div><span style={{ color: '#64ffda' }}>.noclip</span> - Toggles flight</div>
              <div><span style={{ color: '#64ffda' }}>.clear</span> - Removes smokes/blood</div>
              <div><span style={{ color: '#64ffda' }}>.rethrow</span> - Tests last grenade</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
