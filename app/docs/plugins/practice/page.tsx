"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export default function PracticeVitrine() {
  return (
    <div style={{ backgroundColor: '#020617', color: '#f8fafc', minHeight: '100vh', width: '100%', overflowX: 'hidden' }}>
      
      <motion.div 
        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}
        style={{ position: 'sticky', top: '76px', zIndex: 50, background: 'rgba(2, 6, 23, 0.7)', backdropFilter: 'blur(20px)', padding: '16px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <img src="/images/modes/practice.jpg" alt="Practice" style={{ width: '40px', height: '40px', borderRadius: '12px' }} />
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0, letterSpacing: '1px' }}>Practice</h2>
        </div>
        <Link href="/docs" style={{ color: '#10b981', textDecoration: 'none', fontWeight: 500, background: 'rgba(16, 185, 129, 0.1)', padding: '8px 16px', borderRadius: '999px', transition: 'background 0.2s' }}>
          Overview
        </Link>
      </motion.div>

      {/* Hero Section */}
      <div style={{ position: 'relative', height: '90vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 20px', overflow: 'hidden' }}>
        <motion.div 
          initial={{ opacity: 0, scale: 1.1 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.5, ease: "easeOut" }}
          style={{ position: 'absolute', inset: 0, background: 'url(https://via.placeholder.com/1920x1080/064e3b/10b981?text=Inferno+A+Site+Lineups) center/cover', opacity: 0.2, zIndex: 0 }}
        />
        
        <motion.h1 
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.2 }}
          style={{ fontSize: '7vw', fontWeight: 900, margin: '0 0 24px', zIndex: 1, letterSpacing: '-0.02em', background: 'linear-gradient(to right, #34d399, #10b981)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
        >
          Perfect your craft.
        </motion.h1>
        
        <motion.p 
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.4 }}
          style={{ fontSize: '1.4rem', color: '#cbd5e1', maxWidth: '700px', zIndex: 1, lineHeight: 1.7 }}
        >
          The ultimate multiplayer sandbox. Train your crosshair placement, rehearse pixel-perfect nade lineups, and coordinate with your team.
        </motion.p>
      </div>

      {/* Tools Section */}
      <div style={{ padding: '120px 48px', maxWidth: '1400px', margin: '0 auto' }}>
        <motion.h2 
          initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }}
          style={{ fontSize: '3.5rem', fontWeight: 800, marginBottom: '60px', textAlign: 'center' }}
        >
          Built for champions.
        </motion.h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '40px' }}>
          {[
            { title: "Nade Book", text: "Built-in library of essential lineups for all active duty maps.", img: "https://via.placeholder.com/600x400/022c22/10b981?text=Nade+Trajectories" },
            { title: "Prefire Runs", text: "Bots spawn in common holding positions. Clear them out as quickly as possible.", img: "https://via.placeholder.com/600x400/022c22/10b981?text=Prefire+Bots" },
            { title: "Team Drills", text: "Practice executes and crossfires with your teammates without match pressure.", img: "https://via.placeholder.com/600x400/022c22/10b981?text=Multiplayer+Sandbox" }
          ].map((feature, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: i * 0.2 }}
              style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '24px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}
            >
              <img src={feature.img} alt={feature.title} style={{ width: '100%', height: '240px', objectFit: 'cover' }} />
              <div style={{ padding: '32px' }}>
                <h3 style={{ fontSize: '1.8rem', color: '#10b981', marginBottom: '16px' }}>{feature.title}</h3>
                <p style={{ color: '#94a3b8', fontSize: '1.1rem', lineHeight: 1.6 }}>{feature.text}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
      
    </div>
  );
}
