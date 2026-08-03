"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useI18n } from '@/components/I18nProvider';
import "./docs.css";

export default function DocsNav({ navStructure, apiSections }: { navStructure: Record<string, string[]>, apiSections: any[] }) {
    const { t } = useI18n();

  const pathname = usePathname();
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
    Plugins: true,
    Games: true,
    Website: true,
    API: true,
  });

  const toggleCategory = (cat: string) => {
    setOpenCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  return (
    <aside className="docs-sidebar glass-panel" style={{ zIndex: 10, position: 'sticky', top: '76px', height: 'calc(100vh - 108px)' }}>
      <Link href="/docs" className="docs-logo" style={{ marginBottom: '32px' }}>
        <motion.span whileHover={{ scale: 1.1 }} className="docs-logo-mark">🌱</motion.span>
        <span>
          <strong>{t("auto.docsnav.garden_docs")}</strong>
          <small>{t("auto.docsnav.docs_retakes_fr")}</small>
        </span>
      </Link>

      <nav className="docs-nav">
        <Link href="/docs" className="docs-nav-link" style={{ color: pathname === '/docs' ? 'var(--accent)' : 'var(--muted)' }}>
          {t("auto.docsnav.overview")}
                          </Link>

        {Object.entries(navStructure).map(([category, items]) => {
          if (items.length === 0) return null;
          return (
            <div key={category} style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '12px' }}>
              <button 
                onClick={() => toggleCategory(category)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '8px 12px' }}
              >
                {category}
                <motion.span animate={{ rotate: openCategories[category] ? 90 : 0 }} style={{ color: 'var(--muted)', fontSize: '10px' }}>▶</motion.span>
              </button>
              <AnimatePresence initial={false}>
                {openCategories[category] && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '8px', borderLeft: '1px solid var(--border)' }}
                  >
                    {items.map(item => {
                      const href = `/docs/${category.toLowerCase()}/${item}`;
                      const isActive = pathname === href;
                      return (
                        <Link 
                          key={item} 
                          href={href}
                          className="docs-nav-link"
                          style={{ color: isActive ? 'var(--accent)' : 'var(--muted)', background: isActive ? 'var(--accent-soft)' : 'transparent' }}
                        >
                          {item.replace(/-/g, " ")}
                        </Link>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '12px' }}>
          <button 
            onClick={() => toggleCategory('API')}
            style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '8px 12px' }}
          >
            {t("auto.docsnav.api_reference")}
                                  <motion.span animate={{ rotate: openCategories['API'] ? 90 : 0 }} style={{ color: 'var(--muted)', fontSize: '10px' }}>▶</motion.span>
          </button>
          <AnimatePresence initial={false}>
            {openCategories['API'] && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '8px', borderLeft: '1px solid var(--border)' }}
              >
                {apiSections.map(s => {
                  const href = `/docs/${s.slug}`;
                  const isActive = pathname === href;
                  return (
                    <Link 
                      key={s.slug} 
                      href={href}
                      className="docs-nav-link"
                      style={{ color: isActive ? 'var(--accent)' : 'var(--muted)', background: isActive ? 'var(--accent-soft)' : 'transparent' }}
                    >
                      {s.title}
                    </Link>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </nav>

      <div className="docs-sidebar-footer" style={{ marginTop: 'auto' }}>
        <Link href="/">{t("auto.docsnav._back_to_main_site")}</Link>
      </div>
    </aside>
  );
}
