"use client";

import Link from "next/link";
import { useI18n } from '@/components/I18nProvider';
import { motion } from "framer-motion";

export default function RetakesVitrine() {
    const { t } = useI18n();

  return (
    <div style={{ backgroundColor: '#09090b', color: '#fff', minHeight: '100vh', width: '100%', overflowX: 'hidden' }}>
      
      {/* Sticky Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}
        style={{ position: 'sticky', top: '76px', zIndex: 50, background: 'rgba(9, 9, 11, 0.7)', backdropFilter: 'blur(20px)', padding: '16px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <img src="/images/modes/retakes.jpg" alt={t("auto.page.retakes")} style={{ width: '40px', height: '40px', borderRadius: '12px' }} />
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0, letterSpacing: '1px' }}>{t("auto.page.ranked_retakes")}</h2>
        </div>
        <Link href="/docs" style={{ color: '#a855f7', textDecoration: 'none', fontWeight: 500, background: 'rgba(168, 85, 247, 0.1)', padding: '8px 16px', borderRadius: '999px', transition: 'background 0.2s' }}>
          {t("auto.page.overview")}
                          </Link>
      </motion.div>

      {/* Hero Section */}
      <div style={{ position: 'relative', height: '90vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 20px' }}>
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, ease: "easeOut" }}
          style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at center, rgba(168, 85, 247, 0.15) 0%, transparent 60%)', zIndex: 0 }}
        />
        
        <motion.h1 
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.2 }}
          style={{ fontSize: '6vw', fontWeight: 800, margin: '0 0 24px', zIndex: 1, letterSpacing: '-0.04em', background: 'linear-gradient(to bottom right, #fff, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
        >
          {t("auto.page.the_next_era_of_retakes")}
                          </motion.h1>
        
        <motion.p 
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.4 }}
          style={{ fontSize: '1.5rem', color: '#a1a1aa', maxWidth: '800px', zIndex: 1, lineHeight: 1.6 }}
        >
          {t("auto.page.fluid_post_plant_simulations_p")}
                          </motion.p>
      </div>

      {/* Full-width Image Reveal */}
      <motion.div 
        initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.8 }}
        style={{ width: '100%', height: '70vh', background: 'url(https://via.placeholder.com/1920x1080/1a1a1a/444?text=CS2+Gameplay+Screenshot) center/cover', borderTop: '1px solid rgba(255,255,255,0.1)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
      />

      {/* Feature Grids */}
      <div style={{ padding: '120px 48px', maxWidth: '1600px', margin: '0 auto' }}>
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }}>
          <h2 style={{ fontSize: '4rem', fontWeight: 700, marginBottom: '80px', letterSpacing: '-2px' }}>{t("auto.page.a_new_standard_of_play")}</h2>
        </motion.div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '40px' }}>
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.1 }} style={{ background: 'rgba(255,255,255,0.02)', padding: '60px', borderRadius: '32px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <h3 style={{ fontSize: '2.5rem', marginBottom: '24px', color: '#e879f9' }}>{t("auto.page.smart_loadouts")}</h3>
            <p style={{ fontSize: '1.2rem', color: '#a1a1aa', lineHeight: 1.6 }}>{t("auto.page.weapons_are_dynamically_alloca")}</p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.2 }} style={{ background: 'rgba(255,255,255,0.02)', padding: '60px', borderRadius: '32px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <h3 style={{ fontSize: '2.5rem', marginBottom: '24px', color: '#e879f9' }}>{t("auto.page.global_leaderboards")}</h3>
            <p style={{ fontSize: '1.2rem', color: '#a1a1aa', lineHeight: 1.6 }}>{t("auto.page.climb_through_seasonal_ranks_e")}</p>
          </motion.div>
        </div>
      </div>
      
    </div>
  );
}
