"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import AvatarImage from "@/components/AvatarImage";
import { useSocket } from "@/components/games/SocketProvider";

interface PlayerBubbleProps {
  steamId: string;
  name: string;
  children: React.ReactNode;
}

export default function PlayerBubble({ steamId, name, children }: PlayerBubbleProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const { socket } = useSocket();

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current && 
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggle = async () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);

    if (nextOpen && !data && !loading) {
      setLoading(true);
      try {
        const res = await fetch(`/api/profile/${steamId}`);
        if (res.ok) {
          const profileData = await res.json();
          setData(profileData);
        }
      } catch (err) {
        console.error("Error fetching profile", err);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleAddFriend = () => {
    if (socket) {
      socket.emit("friend_request", { targetId: steamId });
      setIsOpen(false);
    }
  };

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <div
        ref={triggerRef}
        onClick={handleToggle}
        style={{ cursor: "pointer", display: "inline-flex", alignItems: "center" }}
      >
        {children}
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={popoverRef}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            style={{
              position: "absolute",
              bottom: "100%",
              left: "50%",
              transform: "translateX(-50%)",
              marginBottom: 12,
              width: 320,
              backgroundColor: "rgba(20, 20, 25, 0.95)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: 16,
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
              zIndex: 1000,
              overflow: "hidden",
              color: "#fff"
            }}
          >
            {/* Bubble Header */}
            <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", overflow: "hidden", flexShrink: 0, backgroundColor: "#222" }}>
                <AvatarImage steamId={steamId} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {name}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {data?.country ? `🌎 ${data.country}` : "Steam User"}
                </div>
              </div>
            </div>

            {/* Content Body */}
            <div style={{ padding: 16 }}>
              {loading ? (
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", textAlign: "center", padding: "20px 0" }}>Loading...</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {data?.bio && (
                    <div style={{ fontSize: 13, fontStyle: "italic", color: "rgba(255,255,255,0.7)" }}>
                      "{data.bio}"
                    </div>
                  )}
                  
                  {/* Quick Stats Summary */}
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ flex: 1, background: "rgba(255,255,255,0.03)", padding: 8, borderRadius: 8, textAlign: "center" }}>
                      <div style={{ fontSize: 10, textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Rating</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{data?.rating?.toFixed(2) ?? "—"}</div>
                    </div>
                    <div style={{ flex: 1, background: "rgba(255,255,255,0.03)", padding: 8, borderRadius: 8, textAlign: "center" }}>
                      <div style={{ fontSize: 10, textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Win %</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{data?.winPct ? `${data.winPct.toFixed(0)}%` : "—"}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div style={{ display: "flex", borderTop: "1px solid rgba(255,255,255,0.05)", background: "rgba(0,0,0,0.2)" }}>
              <Link 
                href={`/players/${steamId}`} 
                style={{ flex: 1, padding: 12, textAlign: "center", fontSize: 13, fontWeight: 600, color: "#fff", textDecoration: "none", transition: "background 0.2s" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                View Profile
              </Link>
              <div 
                style={{ width: 1, background: "rgba(255,255,255,0.05)" }}
              />
              <button 
                onClick={handleAddFriend}
                style={{ flex: 1, padding: 12, background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#4ade80", transition: "background 0.2s" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(74, 222, 128, 0.1)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                title="Add Friend"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle" }}>
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <line x1="20" y1="8" x2="20" y2="14" />
                  <line x1="23" y1="11" x2="17" y2="11" />
                </svg>
              </button>
              <div 
                style={{ width: 1, background: "rgba(255,255,255,0.05)" }}
              />
              <button 
                onClick={() => { alert('Reported!'); setIsOpen(false); }}
                style={{ flex: 1, padding: 12, background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#f87171", transition: "background 0.2s" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(248, 113, 113, 0.1)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                title="Report Player"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle" }}>
                  <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                  <line x1="4" y1="22" x2="4" y2="15" />
                </svg>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
