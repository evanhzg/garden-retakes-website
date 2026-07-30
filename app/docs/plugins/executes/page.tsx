"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export default function ExecutesVitrine() {
  return (
    <div style={{ backgroundColor: '#ffffff', color: '#111827', minHeight: '100vh', width: '100%', overflowX: 'hidden' }}>
      
      {/* Sticky Header - Light */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}
        style={{ position: 'sticky', top: '76px', zIndex: 50, background: 'rgba(255, 255, 255, 0.8)', backdropFilter: 'blur(20px)', padding: '16px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0,0,0,0.05)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <img src="/images/modes/executes.jpg" alt="Executes" style={{ width: '40px', height: '40px', borderRadius: '12px' }} />
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0, letterSpacing: '1px' }}>Executes</h2>
        </div>
        <Link href="/docs" style={{ color: '#0284c7', textDecoration: 'none', fontWeight: 500, background: 'rgba(2, 132, 199, 0.1)', padding: '8px 16px', borderRadius: '999px', transition: 'background 0.2s' }}>
          Overview
        </Link>
      </motion.div>

      {/* Hero Section */}
      <div style={{ position: 'relative', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 20px' }}>
        <motion.h1 
          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, delay: 0.2 }}
          style={{ fontSize: '8vw', fontWeight: 900, margin: '0 0 24px', zIndex: 1, letterSpacing: '-0.05em', color: '#0f172a' }}
        >
          Executes.
        </motion.h1>
        
        <motion.p 
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.4 }}
          style={{ fontSize: '1.8rem', color: '#475569', maxWidth: '800px', zIndex: 1, lineHeight: 1.5, fontWeight: 300 }}
        >
          Flawless site takes. <br />Powered by automated utility deployments.
        </motion.p>
      </div>

      {/* Interlocking Sections */}
      <div style={{ width: '100%' }}>
        {/* Section 1 */}
        <div style={{ display: 'flex', flexDirection: 'row', minHeight: '80vh' }}>
          <motion.div initial={{ opacity: 0, x: -50 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }} style={{ flex: 1, background: '#f8fafc', padding: '10%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <h2 style={{ fontSize: '4rem', fontWeight: 800, color: '#0ea5e9', marginBottom: '24px', letterSpacing: '-1px', lineHeight: 1.1 }}>Pro utility.<br/>Perfect timing.</h2>
            <p style={{ fontSize: '1.3rem', color: '#64748b', lineHeight: 1.6 }}>The server throws perfectly timed smokes and flashes based on Tier 1 professional matches. You focus strictly on pathing, trading, and crosshair placement.</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 50 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }} style={{ flex: 1, background: 'url(https://via.placeholder.com/800x1000/0ea5e9/fff?text=Mirage+A+Execute) center/cover' }} />
        </div>

        {/* Section 2 */}
        <div style={{ display: 'flex', flexDirection: 'row-reverse', minHeight: '80vh' }}>
          <motion.div initial={{ opacity: 0, x: 50 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }} style={{ flex: 1, background: '#0f172a', padding: '10%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <h2 style={{ fontSize: '4rem', fontWeight: 800, color: '#fff', marginBottom: '24px', letterSpacing: '-1px', lineHeight: 1.1 }}>Defend the hold.</h2>
            <p style={{ fontSize: '1.3rem', color: '#94a3b8', lineHeight: 1.6 }}>CT players spawn in randomized, highly advantageous positions. Coordinate crossfires and counter-utility to break the execute before it plants.</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: -50 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }} style={{ flex: 1, background: 'url(https://via.placeholder.com/800x1000/1e293b/fff?text=CT+Setup) center/cover' }} />
        </div>
      </div>
      
    </div>
  );
}
