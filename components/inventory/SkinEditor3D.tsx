"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
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
  
  const syncToApi = useRef(false);

  useEffect(() => {
    // Load ALL stickers and charms
    Promise.all([
      fetch('/api/stickers?limit=0').then(res => res.json()),
      fetch('/api/charms?limit=0').then(res => res.json())
    ]).then(([stickersData, charmsData]) => {
      setAllStickers(stickersData);
      setAllCharms(charmsData);
    });
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
    
    syncToApi.current = true;
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
    syncToApi.current = true;
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
        const econItem = allStickers.find(i => i.name === s.name || i.def === s.def);
        if (econItem) {
          vStickers[idx] = { id: econItem.id, wear: s.wear, rotation: s.rotation, x: s.x, y: s.y, scale: 1 };
        }
      }
    });

    const vKeychains: Record<number, any> = {};
    if (charm) {
      const econItem = allCharms.find(i => i.name === charm.name || i.def === charm.def);
      if (econItem) {
        vKeychains[0] = { id: econItem.id, seed: 1 };
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
  }, [skinId, wear, seed, statTrak, nameTag, stickers, charm, allStickers, allCharms]);

  useEffect(() => {
    if (api && syncToApi.current) {
      syncToApi.current = false;
      api.setItem(viewerItem);
      // Re-apply selection since setItem might reset it
      if (activeSlot === null) {
        api.setSelection({ selection: null });
      } else if (activeSlot === 5) {
        api.setSelection({ selection: { kind: "keychain", index: 0 } });
      } else {
        api.setSelection({ selection: { kind: "sticker", index: activeSlot } });
      }
    }
  }, [api, viewerItem, activeSlot]);

  useEffect(() => {
    if (!api) return;
    if (activeSlot === null) {
      api.setSelection({ selection: null });
    } else if (activeSlot === 5) {
      api.setSelection({ selection: { kind: "keychain", index: 0 } });
    } else {
      api.setSelection({ selection: { kind: "sticker", index: activeSlot } });
    }
  }, [api, activeSlot]);

  useEffect(() => {
    if (!api) return;
    const off = api.on("change", (state) => {
      // Sync selection from 3D viewer
      if (state.selection === null) {
        setActiveSlot(null);
      } else if (state.selection.kind === "keychain") {
        setActiveSlot(5);
      } else if (state.selection.kind === "sticker") {
        setActiveSlot(state.selection.index);
      }

      setStickers(cur => {
        let changed = false;
        const newStickers = [...cur];
        if (state.item.stickers) {
          Object.entries(state.item.stickers).forEach(([slotStr, st]) => {
            if (!st) return;
            const slot = parseInt(slotStr);
            if (newStickers[slot]) {
              const wear = st.wear ?? 0;
              const x = st.x ?? 0;
              const y = st.y ?? 0;
              const rotation = st.rotation ?? 0;
              if (
                newStickers[slot]!.wear !== wear ||
                newStickers[slot]!.x !== x ||
                newStickers[slot]!.y !== y ||
                newStickers[slot]!.rotation !== rotation
              ) {
                newStickers[slot] = { ...newStickers[slot]!, wear, x, y, rotation };
                changed = true;
              }
            }
          });
        }
        return changed ? newStickers : cur;
      });
    });
    return off;
  }, [api]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;
  if (allStickers.length === 0) return null;

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
            <button className="btn" style={{ width: '100%', justifyContent: 'center', background: 'var(--color-accent)', borderColor: 'var(--color-accent)' }} onClick={() => onSave(stickers)}>
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
