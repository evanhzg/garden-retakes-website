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
  const [charm, setCharm] = useState<PlacedSticker | null>(null); // We store charm separately in UI, but wait, Garden loadouts don't have charms yet! The prompt says "+1 for charm". We can just mock it or add it. We will add charm to slot 5 (index 5) or handle it visually.
  
  // The prompt asks for 5 sticker squares + 1 charm square.
  const [activeSlot, setActiveSlot] = useState<number | null>(null); // 0-4 for stickers, 5 for charm
  
  const [searchQuery, setSearchQuery] = useState("");
  
  const allStickers = useMemo(() => {
    return Array.from(CS2Economy.items.values()).filter(i => i.isSticker() || i.isPatch()).map(i => ({
      id: i.id,
      def: i.index ?? 0,
      name: i.name,
      image: i.getImage(),
      rarity: i.rarity ?? "default"
    }));
  }, []);

  const allCharms = useMemo(() => {
    return Array.from(CS2Economy.items.values()).filter(i => i.isKeychain()).map(i => ({
      id: i.id,
      def: i.index ?? 0,
      name: i.name,
      image: i.getImage(),
      rarity: i.rarity ?? "default",
      isCharm: true
    }));
  }, []);

  const searchResults = useMemo(() => {
    if (activeSlot === null) return [];
    const source = activeSlot === 5 ? allCharms : allStickers;
    if (!searchQuery.trim()) return source.slice(0, 50); // Show some defaults
    
    try {
      const regex = new RegExp(searchQuery, "i");
      return source.filter(s => regex.test(s.name)).slice(0, 100);
    } catch {
      // Fallback if regex is invalid
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
    <div className="fixed inset-0 z-[9999] bg-[#0d0d0d] text-white flex flex-col font-sans">
      {/* Navbar */}
      <div className="flex justify-between items-center px-6 py-4 bg-[#111] border-b border-[#222]">
        <h2 className="text-xl font-bold">3D Skin Editor</h2>
        <div className="flex gap-4">
          <button className="px-6 py-2 rounded font-semibold bg-[#222] hover:bg-[#333] transition-colors" onClick={onClose}>
            Abort
          </button>
          <button className="px-6 py-2 rounded font-semibold bg-accent text-white hover:opacity-90 transition-opacity" onClick={() => onSave(stickers)}>
            Update
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Bar: Sticker/Charm Slots */}
        <div className="w-24 bg-[#151515] border-r border-[#222] flex flex-col items-center py-6 gap-4 z-20 shadow-xl">
          {[0, 1, 2, 3, 4].map((slot) => {
            const st = stickers[slot];
            return (
              <div key={slot} className="relative group">
                <button 
                  className={`w-16 h-16 rounded-xl border-2 flex items-center justify-center transition-all ${activeSlot === slot ? 'border-accent bg-accent/10' : 'border-[#333] bg-[#222] hover:border-gray-500'}`}
                  onClick={() => { setActiveSlot(activeSlot === slot ? null : slot); setSearchQuery(""); }}
                >
                  {st ? <img src={st.image} alt="Sticker" className="w-12 h-12 object-contain" /> : <span className="text-gray-500 text-xs text-center">Slot {slot+1}</span>}
                </button>
                {st && (
                  <button className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs" onClick={(e) => { e.stopPropagation(); handleRemoveItem(slot); }}>×</button>
                )}
              </div>
            );
          })}
          
          <div className="w-12 h-px bg-[#333] my-2"></div>

          <div className="relative group">
            <button 
              className={`w-16 h-16 rounded-xl border-2 border-dashed flex items-center justify-center transition-all ${activeSlot === 5 ? 'border-accent bg-accent/10' : 'border-[#444] bg-[#222] hover:border-gray-400'}`}
              onClick={() => { setActiveSlot(activeSlot === 5 ? null : 5); setSearchQuery(""); }}
            >
              {charm ? <img src={charm.image} alt="Charm" className="w-10 h-10 object-contain" /> : <span className="text-gray-500 text-xs">Charm</span>}
            </button>
            {charm && (
              <button className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs" onClick={(e) => { e.stopPropagation(); handleRemoveItem(5); }}>×</button>
            )}
          </div>
        </div>

        {/* Sliding Sidebar for Sticker Selection */}
        <div 
          className="bg-[#1a1a1a] border-r border-[#222] flex flex-col transition-[width,min-width] duration-300 ease-in-out z-10 overflow-hidden"
          style={{ width: activeSlot !== null ? '320px' : '0px', minWidth: activeSlot !== null ? '320px' : '0px' }}
        >
          <div className="w-[320px] flex flex-col h-full">
            <div className="p-4 border-b border-[#222]">
              <input 
                type="text" 
                placeholder={activeSlot === 5 ? "Search Charms (Regex supported)..." : "Search Stickers (Regex supported)..."}
                className="w-full bg-[#111] border border-[#333] rounded px-3 py-2 text-sm focus:outline-none focus:border-accent text-white"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-3 gap-2 align-start content-start">
              {searchResults.map(s => (
                <button 
                  key={s.id} 
                  className="aspect-square bg-[#222] rounded border border-[#333] hover:border-accent flex items-center justify-center p-2 group"
                  onClick={() => handleApplyItem(s)}
                  title={s.name}
                >
                  <img src={s.image} alt="" className="w-full h-full object-contain group-hover:scale-110 transition-transform" loading="lazy" />
                </button>
              ))}
              {searchResults.length === 0 && (
                <div className="col-span-3 text-center text-gray-500 text-sm py-8">No results found.</div>
              )}
            </div>
          </div>
        </div>

        {/* 3D Viewer Area */}
        <div className="flex-1 relative bg-grid-pattern">
          {/* Radial gradient background at the bottom */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: 'radial-gradient(ellipse at bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 70%)'
          }}></div>
          
          <Viewer 
            item={viewerItem}
            onApi={setApi}
            className="w-full h-full border-none outline-none relative z-0"
            style={{ width: "100%", height: "100%", border: "none" }}
          />
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .bg-grid-pattern {
          background-color: var(--c-bg);
          background-image: linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
          background-size: 30px 30px;
        }
      `}} />
    </div>
  );

  if (!mounted) return null;
  return createPortal(content, document.body);
}
