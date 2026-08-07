"use client";

import React, { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { Viewer } from "@/lib/viewer/viewer-component";
import { ViewerApi } from "@/lib/viewer/viewer-api";
import { CS2Economy } from "@ianlucas/cs2-lib";
import { ViewerItemInput } from "@/lib/viewer/viewer";
import { PlacedSticker, STICKER_SLOTS } from "@/lib/inventory";
import { useI18n } from '@/components/I18nProvider';

type SkinEditor3DProps = {
  skinId: number;
  wear: number;
  seed: number;
  statTrak: boolean;
  nameTag: string;
  initialStickers: (PlacedSticker | null)[];
  onSave: (stickers: (PlacedSticker | null)[]) => void;
  onClose: () => void;
};

type StickerOption = { id: number; def: number; name: string; image: string; rarity: string; isCharm?: boolean };

export default function SkinEditor3D({
  skinId,
  wear,
  seed,
  statTrak,
  nameTag,
  initialStickers,
  onSave,
  onClose
}: SkinEditor3DProps) {
  const { t } = useI18n();
  const [api, setApi] = useState<ViewerApi | undefined>();
  const [stickers, setStickers] = useState<(PlacedSticker | null)[]>([...initialStickers]);
  const [charm, setCharm] = useState<PlacedSticker | null>(null); 
  
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [allStickers, setAllStickers] = useState<StickerOption[]>([]);
  const [allCharms, setAllCharms] = useState<StickerOption[]>([]);
  
  useEffect(() => {
    // Load initial stickers and charms list
    fetch('/api/stickers?q=').then(res => res.json()).then(data => setAllStickers(data));
    fetch('/api/charms?q=').then(res => res.json()).then(data => setAllCharms(data));
  }, []);

  const searchResults = useMemo(() => {
    if (activeSlot === null) return [];
    const source = activeSlot === 5 ? allCharms : allStickers;
    if (!searchQuery.trim()) return source.slice(0, 50);
    
    try {
      const regex = new RegExp(searchQuery, "i");
      return source.filter(s => regex.test(s.name)).slice(0, 100);
    } catch {
      const lower = searchQuery.toLowerCase();
      return source.filter(s => s.name.toLowerCase().includes(lower)).slice(0, 100);
    }
  }, [searchQuery, activeSlot, allStickers, allCharms]);

  const handleApplyItem = (item: StickerOption) => {
    if (activeSlot === null) return;
    
    if (activeSlot === 5) {
      setCharm({
        def: item.def,
        name: item.name,
        image: item.image,
        slot: 5,
        wear: 0, x: 0, y: 0, rotation: 0
      });
    } else {
      const newStickers = [...stickers];
      newStickers[activeSlot] = {
        def: item.def,
        name: item.name,
        image: item.image,
        slot: activeSlot,
        wear: 0, x: 0, y: 0, rotation: 0
      };
      setStickers(newStickers);
    }
  };

  const handleRemoveItem = (slot: number) => {
    if (slot === 5) {
      setCharm(null);
    } else {
      const newStickers = [...stickers];
      newStickers[slot] = null;
      setStickers(newStickers);
    }
  };

  const viewerItem = useMemo<ViewerItemInput>(() => {
    const vStickers: Record<number, any> = {};
    stickers.forEach((s, idx) => {
      if (s) {
        // We need the CS2Economy ID for the viewer, but PlacedSticker stores 'def' which might be index.
        // In the simulator, the sticker id is the economy ID. Wait, InventorySimulator uses getById(s as number).
        // Let's assume 'def' is the economy index, but wait, CS2Economy.items has id and index.
        // Actually, if we look at `api/loadout/import-cstrike`, it maps sticker to `def: stickerItem.index ?? 0`.
        // The viewer needs the exact economy `id` for stickers. We'll search it by name or index.
        const econItem = Array.from(CS2Economy.items.values()).find(i => i.name === s.name);
        if (econItem) {
          vStickers[idx] = { id: econItem.id, wear: s.wear, rotation: s.rotation, scale: 1 };
        }
      }
    });

    const vKeychains: Record<number, any> = {};
    if (charm) {
      const econItem = Array.from(CS2Economy.items.values()).find(i => i.name === charm.name);
      if (econItem) {
        vKeychains[0] = { id: econItem.id, seed: 1 }; // Charm slot is usually 0
      }
    }

    return {
      id: skinId,
      wear,
      seed,
      stattrak: statTrak,
      nametag: nameTag,
      stickers: vStickers,
      keychains: vKeychains
    };
  }, [skinId, wear, seed, statTrak, nameTag, stickers, charm]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const content = (
    <div className="inv4-editor3d" onClick={onClose}>
      <div className="inv4-editor3d-window" onClick={e => e.stopPropagation()}>
        {/* Left Bar: Sticker/Charm Slots */}
        <div className="inv4-editor3d-sidebar">
          {[0, 1, 2, 3, 4].map((slot) => {
            const st = stickers[slot];
            return (
              <div key={slot} style={{ position: 'relative' }}>
                <button 
                  className={`inv4-editor3d-slot ${activeSlot === slot ? 'active' : ''}`}
                  onClick={() => { setActiveSlot(activeSlot === slot ? null : slot); setSearchQuery(""); }}
                >
                  {st ? <img src={st.image} alt="Sticker" /> : <span>Slot {slot+1}</span>}
                </button>
                {st && (
                  <button className="inv4-editor3d-slot-remove" onClick={(e) => { e.stopPropagation(); handleRemoveItem(slot); }}>×</button>
                )}
              </div>
            );
          })}
          
          <div className="inv4-editor3d-divider"></div>

          <div style={{ position: 'relative', marginBottom: 'auto' }}>
            <button 
              className={`inv4-editor3d-slot ${activeSlot === 5 ? 'active' : ''}`}
              style={{ borderStyle: 'dashed' }}
              onClick={() => { setActiveSlot(activeSlot === 5 ? null : 5); setSearchQuery(""); }}
            >
              {charm ? <img src={charm.image} alt="Charm" /> : <span>Charm</span>}
            </button>
            {charm && (
              <button className="inv4-editor3d-slot-remove" onClick={(e) => { e.stopPropagation(); handleRemoveItem(5); }}>×</button>
            )}
          </div>
          
          <div className="inv4-editor3d-actions" style={{ flexDirection: 'column', gap: '8px', padding: '0 8px', width: '100%' }}>
            <button className="btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => onSave(stickers)}>
              Save
            </button>
            <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={onClose}>
              Abort
            </button>
          </div>
        </div>
          
        {/* Sliding Sidebar for Sticker Selection */}
        <div 
          className="inv4-editor3d-drawer"
          style={{ width: activeSlot !== null ? '320px' : '0px', minWidth: activeSlot !== null ? '320px' : '0px' }}
        >
          <div className="inv4-editor3d-drawer-inner">
            <div className="inv4-editor3d-search">
              <input 
                type="text" 
                placeholder={activeSlot === 5 ? "Search Charms (Regex supported)..." : "Search Stickers (Regex supported)..."}
                className="input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="inv4-editor3d-grid">
              {searchResults.map(s => (
                <button 
                  key={s.id} 
                  className="inv4-editor3d-item"
                  onClick={() => handleApplyItem(s)}
                  title={s.name}
                >
                  <img src={s.image} alt="" loading="lazy" />
                </button>
              ))}
              {searchResults.length === 0 && (
                <div className="inv4-editor3d-empty">No results found.</div>
              )}
            </div>
          </div>
        </div>

        {/* 3D Viewer Area */}
        <div className="inv4-editor3d-viewer">
          {/* Radial gradient background at the bottom */}
          <div className="inv4-editor3d-gradient"></div>
          
          <Viewer 
            item={viewerItem}
            onApi={setApi}
            style={{ width: "100%", height: "100%", border: "none", position: "relative", zIndex: 0 }}
          />
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(content, document.body);
}
