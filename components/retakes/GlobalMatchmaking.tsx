"use client";

import React, { useEffect, useState } from "react";
import { useSocket } from "@/components/games/SocketProvider";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import AvatarImage from "@/components/AvatarImage";

export default function GlobalMatchmaking({ avatarPlayers = [] }: { avatarPlayers?: any[] }) {
  const { socket, isAuthed, steamId } = useSocket();
  const [state, setState] = useState<any>(null);
  const pathname = usePathname();
  const [clicked, setClicked] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!socket || !isAuthed) return;
    socket.emit("rq:hello", {});
    const onState = (s: any) => setState(s);
    socket.on("rq:state", onState);
    return () => { socket.off("rq:state", onState); };
  }, [socket, isAuthed]);

  // Tick for timer
  useEffect(() => {
    const int = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(int);
  }, []);

  // Lock body scroll when match is found
  useEffect(() => {
    const isFound = state?.match && state.match.phase === "found";
    if (isFound) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [state?.match?.phase]);

  if (!state || !state.party) return null;
  const isQueueing = state.party.queuedAt !== null;
  const isFound = state.match && state.match.phase === "found";
  
  const handlePlay = () => {
    if (!socket) return;
    setClicked(true);
    setTimeout(() => setClicked(false), 300);
    if (!isQueueing) socket.emit("rq:queue:join", { mode: state.party.mode });
  };
  const handleStop = () => { if (socket) socket.emit("rq:queue:leave"); };

  const elapsed = isQueueing ? Math.floor((now - state.party.queuedAt) / 1000) : 0;
  const formattedTime = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

  const renderAcceptModal = () => {
    if (!isFound) return null;
    const acceptData = state.match.accept;
    const timeLeft = acceptData ? Math.max(0, Math.ceil((acceptData.deadline - now) / 1000)) : 0;
    
    // Check if I have accepted
    let iAccepted = false;
    for (const t of state.match.teams) {
      for (const p of t.players) {
        if (p.steamId === steamId && p.accepted) iAccepted = true;
      }
    }

    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 999999,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)"
      }}>
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{
            background: "var(--color-surface)",
            padding: "48px",
            borderRadius: "0",
            display: "flex", flexDirection: "column", alignItems: "center", gap: "32px",
            border: "1px solid var(--color-border)",
            boxShadow: "0 20px 40px rgba(0,0,0,0.5)"
          }}
        >
          <h1 style={{ margin: 0, fontSize: "36px", color: "var(--color-accent)" }}>MATCH FOUND</h1>
          <div style={{ fontSize: "64px", fontWeight: "bold" }}>{timeLeft}s</div>
          <div style={{ fontSize: "18px", color: "var(--color-text-muted)" }}>
            {acceptData?.done || 0} / {acceptData?.total || 0} Accepted
          </div>
          <div style={{ display: "flex", gap: "16px", marginTop: "16px" }}>
            <button 
              disabled={iAccepted}
              onClick={() => socket?.emit("rq:match:accept")}
              className={`btn ${iAccepted ? "btn-secondary" : "btn-primary"}`}
              style={{
                padding: "16px 48px",
                fontSize: "20px",
                cursor: iAccepted ? "not-allowed" : "pointer",
                borderRadius: "0"
              }}
            >
              {iAccepted ? "ACCEPTED" : "ACCEPT"}
            </button>
            {!iAccepted && (
              <button 
                onClick={() => socket?.emit("rq:match:decline")}
                className="btn btn-secondary"
                style={{
                  padding: "16px 32px",
                  fontSize: "20px",
                  borderRadius: "0",
                  cursor: "pointer"
                }}
              >
                DECLINE
              </button>
            )}
          </div>
        </motion.div>
      </div>
    );
  };

  return (
    <>
      <div style={{
        backgroundColor: "var(--color-accent)",
        color: "var(--color-accent-foreground, #fff)",
        padding: "12px var(--page-pad)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: "64px"
      }}>
        {/* Left: Avatars & Team Name */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", width: "33%" }}>
          <div style={{ display: "flex", marginLeft: "8px" }}>
            {state.party.members.map((m: any, i: number) => {
              const p = avatarPlayers.find((ap) => ap.steamId === m.steamId);
              return (
                <div key={m.steamId} style={{ 
                  width: "36px", height: "36px", borderRadius: "50%", 
                  marginLeft: i > 0 ? "-12px" : "0",
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "rgba(0,0,0,0.5)", overflow: "hidden",
                  display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                  {p?.avatarSrc ? (
                    <img src={p.avatarSrc} alt={m.name || "Player"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span style={{ fontSize: "14px", fontWeight: "bold" }}>{(m.name || "?").charAt(0).toUpperCase()}</span>
                  )}
                </div>
              );
            })}
          </div>
          {state.party.name && (
            <span style={{ fontWeight: "bold", fontSize: "16px", textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}>
              {state.party.name}
            </span>
          )}
        </div>

        {/* Center: Play/Timer Button */}
        <div style={{ display: "flex", justifyContent: "center", width: "33%" }}>
          {!isQueueing ? (
            <div style={{ position: "relative" }}>
              <button 
                onClick={handlePlay}
                style={{
                  background: "var(--color-accent-foreground, #fff)",
                  color: "var(--color-accent)",
                  border: "none",
                  padding: "8px 48px",
                  borderRadius: "0px",
                  fontWeight: "bold",
                  fontSize: "16px",
                  cursor: "pointer",
                  position: "relative",
                  zIndex: 2,
                  transition: "transform 0.1s ease",
                  transform: clicked ? "scale(0.95)" : "scale(1)",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.2)"
                }}>
                PLAY
              </button>
            </div>
          ) : (
            <button 
              onClick={handleStop}
              style={{
                background: "rgba(0,0,0,0.2)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.3)",
                padding: "8px 32px",
                borderRadius: "0px",
                fontWeight: "bold",
                fontSize: "16px",
                cursor: "pointer",
                display: "flex", alignItems: "center", gap: "8px"
              }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ef4444", animation: "pulse 1.5s infinite" }} />
              SEARCHING {formattedTime}
            </button>
          )}
        </div>

        {/* Right: Lobby Link */}
        <div style={{ display: "flex", justifyContent: "flex-end", width: "33%" }}>
          {pathname !== "/retakes/lobby" && (
            <Link href="/retakes/lobby" style={{
              color: "#fff",
              textDecoration: "none",
              fontWeight: "bold",
              fontSize: "14px",
              padding: "8px 16px",
              borderRadius: "4px",
              background: "rgba(0,0,0,0.15)",
              transition: "background 0.2s"
            }}>
              LOBBY &rarr;
            </Link>
          )}
        </div>
      </div>
      {renderAcceptModal()}
    </>
  );
}
