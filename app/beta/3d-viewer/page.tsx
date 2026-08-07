"use client";

import React, { useEffect, useState, useMemo } from "react";
import { Viewer } from "@/lib/viewer/viewer-component";
import { ViewerApi } from "@/lib/viewer/viewer-api";
import { CS2Economy, CS2_ITEMS } from "@ianlucas/cs2-lib";
import { ViewerItemInput } from "@/lib/viewer/viewer";
import "@/app/globals.css";

export default function ViewerPage() {
  const [api, setApi] = useState<ViewerApi | undefined>();
  const [loaded, setLoaded] = useState(false);
  const [scrapeWear, setScrapeWear] = useState(0);
  const [selectedWeapon, setSelectedWeapon] = useState<number>(2269); // Default AK-47 Redline
  const [selectedSticker, setSelectedSticker] = useState<number>(73); // Default Titan Holo
  const [selectedCharm, setSelectedCharm] = useState<number | null>(null);

  useEffect(() => {
    try {
      CS2Economy.load({ items: CS2_ITEMS });
    } catch (e) {
      console.warn("CS2Economy already initialized");
    }
    setLoaded(true);
  }, []);

  const weapons = useMemo(() => {
    if (!loaded) return [];
    return Array.from(CS2Economy.items.values()).filter(i => i.isWeapon() || i.isMelee() || i.isAgent());
  }, [loaded]);

  const stickers = useMemo(() => {
    if (!loaded) return [];
    // Include stickers and patches
    return Array.from(CS2Economy.items.values()).filter(i => i.isSticker() || i.isPatch());
  }, [loaded]);

  const charms = useMemo(() => {
    if (!loaded) return [];
    return Array.from(CS2Economy.items.values()).filter(i => i.isKeychain());
  }, [loaded]);

  const itemToView = useMemo<ViewerItemInput | undefined>(() => {
    if (!loaded) return undefined;
    
    const baseItem: any = {
      id: selectedWeapon,
      wear: 0.15,
    };

    if (selectedSticker) {
      baseItem.stickers = {
        0: { id: selectedSticker, wear: scrapeWear, scale: 1, rotation: 0 }
      };
    }

    if (selectedCharm) {
      baseItem.keychains = {
        0: { id: selectedCharm }
      };
    }
    
    return baseItem as ViewerItemInput;
  }, [loaded, selectedWeapon, selectedSticker, selectedCharm, scrapeWear]);

  const handleScrapeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setScrapeWear(val);
    if (api) {
      api.setStickerWear({ index: 0, wear: val });
    }
  };

  if (!loaded) return <div className="p-8 text-white">Loading CS2 Economy...</div>;

  return (
    <div className="flex flex-col h-screen bg-[#0d0d0d] text-white font-sans">
      <header className="p-4 border-b border-[#222] bg-[#111] flex justify-between items-center z-10 shadow-md">
        <h1 className="text-2xl font-bold text-fuchsia-500 tracking-tight">Garden BETA 3D Skin Viewer</h1>
        <div className="text-sm font-medium text-gray-500 bg-[#222] px-3 py-1 rounded-full">Powered by 3d.cstrike.app</div>
      </header>
      
      <div className="flex flex-1 overflow-hidden relative">
        {/* Main Viewer Area */}
        <div className="flex-1 relative flex items-center justify-center bg-black">
          <Viewer 
            item={itemToView}
            onApi={setApi}
            className="w-full h-full border-none outline-none"
            style={{ width: "100%", height: "100%", border: "none" }}
          />
        </div>
        
        {/* Controls Sidebar */}
        <div className="w-[400px] bg-[#111]/90 backdrop-blur-md border-l border-[#222] p-8 flex flex-col gap-8 overflow-y-auto shadow-2xl z-10">
          
          <div className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
              <span className="w-2 h-6 bg-fuchsia-500 rounded-sm inline-block"></span>
              Item Selection
            </h2>
            <p className="text-xs text-gray-400 mb-2 leading-relaxed">Select a weapon, knife, or agent to inspect. The viewer provides exact in-game positioning and lighting.</p>
            <select 
              className="w-full bg-[#1a1a1a] border border-[#333] p-3 rounded-lg text-white focus:outline-none focus:border-fuchsia-500 transition-colors shadow-inner"
              value={selectedWeapon}
              onChange={(e) => setSelectedWeapon(Number(e.target.value))}
            >
              {weapons.map((w: any) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          <div className="w-full h-px bg-gradient-to-r from-transparent via-[#333] to-transparent"></div>

          <div className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
              <span className="w-2 h-6 bg-blue-500 rounded-sm inline-block"></span>
              Stickers & Patches
            </h2>
            <p className="text-xs text-gray-400 mb-2 leading-relaxed">Apply stickers (or patches for agents). Exact scale and rotation matches the CS2 client.</p>
            <select 
              className="w-full bg-[#1a1a1a] border border-[#333] p-3 rounded-lg text-white focus:outline-none focus:border-blue-500 transition-colors shadow-inner"
              value={selectedSticker}
              onChange={(e) => setSelectedSticker(Number(e.target.value))}
            >
              <option value={0}>None</option>
              {stickers.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            
            {selectedSticker !== 0 && (
              <div className="flex flex-col gap-3 mt-4 bg-[#1a1a1a] p-4 rounded-lg border border-[#2a2a2a]">
                <label className="text-sm font-bold flex justify-between items-center text-gray-200">
                  Scrape / Wear Level
                  <span className="text-blue-400 font-mono bg-blue-900/30 px-2 py-1 rounded text-xs">{(scrapeWear * 100).toFixed(0)}%</span>
                </label>
                <input 
                  type="range" 
                  min="0" max="1" step="0.01" 
                  value={scrapeWear}
                  onChange={handleScrapeChange}
                  className="w-full accent-blue-500 cursor-pointer"
                />
              </div>
            )}
          </div>

          <div className="w-full h-px bg-gradient-to-r from-transparent via-[#333] to-transparent"></div>

          <div className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
              <span className="w-2 h-6 bg-green-500 rounded-sm inline-block"></span>
              Charms (Keychains)
            </h2>
            <select 
              className="w-full bg-[#1a1a1a] border border-[#333] p-3 rounded-lg text-white focus:outline-none focus:border-green-500 transition-colors shadow-inner"
              value={selectedCharm || 0}
              onChange={(e) => setSelectedCharm(Number(e.target.value) || null)}
            >
              <option value={0}>None</option>
              {charms.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

        </div>
      </div>
    </div>
  );
}
