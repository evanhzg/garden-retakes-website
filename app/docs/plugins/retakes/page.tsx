import Link from "next/link";

export const metadata = { title: "Retakes Mode" };

export default function RetakesVitrine() {
  return (
    <div style={{ background: '#050505', color: '#fff', minHeight: '100vh', fontFamily: '"Courier New", Courier, monospace', border: '20px solid #ffff00' }}>
      <div style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #ffff00' }}>
        <Link href="/docs" style={{ color: '#ffff00', textDecoration: 'none', fontWeight: 'bold', textTransform: 'uppercase' }}>[ ESCAPE TO DOCS ]</Link>
        <span style={{ color: '#ffff00', fontWeight: 'bold' }}>SYSTEM: ONLINE</span>
      </div>

      <div style={{ padding: '80px', display: 'flex', flexDirection: 'column', gap: '40px' }}>
        <h1 style={{ fontSize: '8vw', fontWeight: 900, color: '#ffff00', margin: 0, lineHeight: 0.9, textTransform: 'uppercase' }}>
          RANKED<br/>RETAKES
        </h1>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginTop: '40px' }}>
          <div style={{ background: '#111', border: '2px solid #ffff00', padding: '40px' }}>
            <img src="/images/modes/retakes.jpg" alt="Retakes" style={{ width: '100%', filter: 'contrast(150%) saturate(0) sepia(100%) hue-rotate(20deg)' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ background: '#ffff00', color: '#000', padding: '20px', fontWeight: 'bold', fontSize: '1.2rem' }}>
              // THE GOLD STANDARD OF POST-PLANT SIMULATION
            </div>
            <p style={{ fontSize: '1.2rem', lineHeight: 1.6, color: '#ccc' }}>
              Built for grinders. Featuring a custom TrueSkill Elo system, dynamic weapon allocators based on round economy, and grueling leaderboards. Adapt to endless post-plant scenarios and prove your worth on the ladder.
            </p>
            <div style={{ border: '2px dashed #ffff00', padding: '20px' }}>
              <h3 style={{ color: '#ffff00', margin: '0 0 10px' }}>QUICK COMMANDS</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: '#ccc', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <li><strong style={{ color: '#fff' }}>!guns</strong> - CONFIGURE LOADOUT</li>
                <li><strong style={{ color: '#fff' }}>!elo</strong> - CHECK RATING</li>
                <li><strong style={{ color: '#fff' }}>!rank</strong> - LEADERBOARD POS</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
