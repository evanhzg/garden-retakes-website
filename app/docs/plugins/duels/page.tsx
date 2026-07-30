"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export default function DuelsVitrine() {
  return (
    <div style={{ backgroundColor: '#2a0a0a', color: '#fff', minHeight: '100vh', width: '100%', overflowX: 'hidden' }}>
      
      <motion.div 
        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}
        style={{ position: 'sticky', top: '76px', zIndex: 50, background: 'rgba(42, 10, 10, 0.7)', backdropFilter: 'blur(20px)', padding: '16px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,0,0,0.1)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <img src="/images/modes/duels.jpg" alt="Duels" style={{ width: '40px', height: '40px', borderRadius: '12px' }} />
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0, letterSpacing: '1px', textTransform: 'uppercase' }}>Duels</h2>
        </div>
        <Link href="/docs" style={{ color: '#ef4444', textDecoration: 'none', fontWeight: 500, background: 'rgba(239, 68, 68, 0.1)', padding: '8px 16px', borderRadius: '999px', transition: 'background 0.2s' }}>
          Overview
        </Link>
      </motion.div>

      {/* Hero Section */}
      <div style={{ position: 'relative', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 20px', overflow: 'hidden' }}>
        <motion.div 
          initial={{ opacity: 0, scale: 1.1 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 2, ease: "easeOut" }}
          style={{ position: 'absolute', inset: 0, background: 'url(https://via.placeholder.com/1920x1080/450a0a/ef4444?text=Aim+Arena) center/cover', opacity: 0.3, zIndex: 0 }}
        />
        
        <motion.h1 
          initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 100, delay: 0.2 }}
          style={{ fontSize: '10vw', fontWeight: 900, margin: '0 0 24px', zIndex: 1, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#f87171', textShadow: '0 10px 40px rgba(239,68,68,0.5)' }}
        >
          DUELS
        </motion.h1>
        
        <motion.p 
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.5 }}
          style={{ fontSize: '1.5rem', color: '#fca5a5', maxWidth: '600px', zIndex: 1, lineHeight: 1.6, textTransform: 'uppercase', letterSpacing: '2px' }}
        >
          1v1 & 2v2 Arenas. <br/>Settle the score.
        </motion.p>
      </div>

      {/* Angled Parallax Section */}
      <motion.div 
        initial={{ opacity: 0, y: 100 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }}
        style={{ width: '100%', padding: '100px 0', background: 'linear-gradient(135deg, #ef4444 0%, #991b1b 100%)', transform: 'skewY(-3deg)', transformOrigin: 'top left', marginTop: '-50px', zIndex: 10, position: 'relative' }}
      >
        <div style={{ transform: 'skewY(3deg)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 40px' }}>
          <h2 style={{ fontSize: '4rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: '40px', textAlign: 'center' }}>Raw Mechanics. Zero Excuses.</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '40px', width: '100%', maxWidth: '1200px' }}>
            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '40px', borderRadius: '20px' }}>
              <h3 style={{ fontSize: '2rem', marginBottom: '20px', color: '#fca5a5' }}>Custom Arenas</h3>
              <p style={{ fontSize: '1.2rem', lineHeight: 1.5 }}>Hand-crafted maps designed purely for aim duels. No hiding, no flanking. Just you and your opponent.</p>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '40px', borderRadius: '20px' }}>
              <h3 style={{ fontSize: '2rem', marginBottom: '20px', color: '#fca5a5' }}>!challenge</h3>
              <p style={{ fontSize: '1.2rem', lineHeight: 1.5 }}>Pull anyone from the server into a private duel. Put your money where your mouth is.</p>
            </div>
          </div>
        </div>
      </motion.div>
      
    </div>
  );
}
