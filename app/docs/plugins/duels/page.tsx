import Link from "next/link";

export const metadata = { title: "Duels Mode" };

export default function DuelsVitrine() {
  return (
    <div style={{ background: 'url(/images/bg-arena.jpg) #1a0505', backgroundBlendMode: 'overlay', color: '#fff', minHeight: '100vh', fontFamily: '"Impact", sans-serif', padding: '60px' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', textTransform: 'uppercase' }}>
        <Link href="/docs" style={{ color: '#ff3333', textDecoration: 'none', fontSize: '1.5rem', textShadow: '0 0 10px #ff3333' }}>BACK TO LOBBY</Link>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '10vh' }}>
        <img src="/images/modes/duels.jpg" alt="Duels" style={{ width: '250px', borderRadius: '50%', border: '10px solid #ff3333', boxShadow: '0 0 50px #ff3333', marginBottom: '40px' }} />
        
        <h1 style={{ fontSize: '8rem', margin: 0, color: '#fff', textShadow: '4px 4px 0 #ff3333, -2px -2px 0 #800000', letterSpacing: '5px' }}>DUELS</h1>
        <h2 style={{ fontSize: '2.5rem', color: '#ffaaaa', margin: '10px 0 60px', fontFamily: 'sans-serif', fontWeight: 900, textTransform: 'uppercase' }}>Settle The Score.</h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', maxWidth: '1000px', width: '100%' }}>
          <div style={{ background: 'rgba(255, 51, 51, 0.1)', border: '2px solid #ff3333', padding: '40px', textAlign: 'center' }}>
            <h3 style={{ fontSize: '3rem', margin: '0 0 20px', color: '#ff3333' }}>1v1 ARENAS</h3>
            <p style={{ fontFamily: 'sans-serif', fontSize: '1.2rem', lineHeight: 1.5, color: '#ddd' }}>
              Pure aim, zero excuses. Face off in tightly designed arenas built for raw mechanical duels. Rifle and AWP ladders available.
            </p>
          </div>
          <div style={{ background: 'rgba(255, 51, 51, 0.1)', border: '2px solid #ff3333', padding: '40px', textAlign: 'center' }}>
            <h3 style={{ fontSize: '3rem', margin: '0 0 20px', color: '#ff3333' }}>CHALLENGES</h3>
            <p style={{ fontFamily: 'sans-serif', fontSize: '1.2rem', lineHeight: 1.5, color: '#ddd' }}>
              Type <strong style={{ color: '#fff' }}>!challenge [name]</strong> in chat to pull a player into a private duel room. The loser buys the next drop.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
