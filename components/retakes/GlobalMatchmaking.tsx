"use client";

import React, { useEffect, useState } from "react";
import { useSocket } from "@/components/games/SocketProvider";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

export default function GlobalMatchmaking() {
  const { socket, isAuthed } = useSocket();
  const [state, setState] = useState<any>(null);
  const pathname = usePathname();
  const [clicked, setClicked] = useState(false);

  useEffect(() => {
    if (!socket || !isAuthed) return;
    socket.emit("rq:hello", {});
    const onState = (s: any) => setState(s);
    socket.on("rq:state", onState);
    return () => { socket.off("rq:state", onState); };
  }, [socket, isAuthed]);

  if (!state || !state.party) return null;
  const isQueueing = state.party.queuedAt !== null;
  const isFound = state.match && state.match.phase === "found";
  const isReady = state.match && state.match.phase === "ready";

  const handlePlay = () => {
    if (!socket) return;
    setClicked(true);
    setTimeout(() => setClicked(false), 300);
    if (!isQueueing) socket.emit("rq:queue:join", { mode: state.party.mode });
  };
  const handleStop = () => { if (socket) socket.emit("rq:queue:leave"); };
  const toggleMode = (mode: string) => { if (socket && !isQueueing) socket.emit("rq:party:mode", { mode }); };

  return (
    <div style={{
      backgroundColor: "var(--color-background-accent, rgba(168,85,247,0.05))",
      borderBottom: "1px solid var(--color-accent, #a855f7)",
      padding: "12px var(--page-pad)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: "16px"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        {isQueueing && (
          <div className="thinking-orb" style={{
            width: "36px", height: "36px", borderRadius: "50%",
            background: "radial-gradient(circle at 30% 30%, var(--color-accent), transparent), repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px), repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)",
            animation: "pulse-orb 2s infinite ease-in-out, spin 10s linear infinite",
            boxShadow: "0 0 15px var(--color-accent), inset 0 0 10px rgba(0,0,0,0.5)",
            border: "1px solid rgba(255,255,255,0.2)"
          }} />
        )}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: 600, fontSize: "14px" }}>
            {isReady ? "Server Ready" : isFound ? "Match Found!" : isQueueing ? "Searching for a game..." : "Ready to play"}
          </span>
          {isQueueing && (
            <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
              {Math.floor((Date.now() - state.party.queuedAt) / 1000)}s elapsed
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
          {!isQueueing && !state.match ? (
            <div style={{ position: "relative" }}>
              <button 
                onClick={handlePlay}
                style={{
                  background: "var(--color-accent)",
                  color: "#fff",
                  border: "none",
                  padding: "8px 32px",
                  borderRadius: "4px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  position: "relative",
                  zIndex: 2,
                  transition: "transform 0.1s ease",
                  transform: clicked ? "scale(0.95)" : "scale(1)"
                }}>
                PLAY
              </button>
              {clicked && (
                <motion.div
                  initial={{ opacity: 0.8, scale: 1, boxShadow: "0 0 0px var(--color-accent)" }}
                  animate={{ opacity: 0, scale: 1.6, boxShadow: "0 0 40px var(--color-accent)" }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "var(--color-accent)",
                    borderRadius: "4px",
                    zIndex: 1,
                    pointerEvents: "none"
                  }}
                />
              )}
            </div>
          ) : (
            <button 
              onClick={handleStop}
              style={{
                background: "transparent",
                color: "var(--color-text)",
                border: "1px solid var(--color-divider)",
                padding: "8px 24px",
                borderRadius: "4px",
                fontWeight: "bold",
                cursor: "pointer"
              }}>
              STOP
            </button>
          )}

          {!isQueueing && !state.match && (
            <div style={{ display: "flex", background: "rgba(0,0,0,0.2)", borderRadius: "20px", padding: "2px", width: "100%", justifyContent: "space-between" }}>
              <button 
                onClick={() => toggleMode("2v2")}
                style={{
                  flex: 1,
                  padding: "2px 8px",
                  borderRadius: "16px",
                  background: state.party.mode === "2v2" ? "var(--color-accent)" : "transparent",
                  color: state.party.mode === "2v2" ? "#fff" : "var(--color-text-muted)",
                  border: "none", cursor: "pointer", fontSize: "10px", fontWeight: "bold"
                }}>
                2V2
              </button>
              <button 
                onClick={() => toggleMode("3v3")}
                style={{
                  flex: 1,
                  padding: "2px 8px",
                  borderRadius: "16px",
                  background: state.party.mode === "3v3" ? "var(--color-accent)" : "transparent",
                  color: state.party.mode === "3v3" ? "#fff" : "var(--color-text-muted)",
                  border: "none", cursor: "pointer", fontSize: "10px", fontWeight: "bold"
                }}>
                3V3
              </button>
            </div>
          )}
        </div>

        {pathname !== "/retakes/lobby" && (
          <Link href="/retakes/lobby" style={{
            background: "rgba(255,255,255,0.1)",
            color: "#fff",
            textDecoration: "none",
            padding: "8px 16px",
            borderRadius: "4px",
            fontSize: "13px",
            display: "flex",
            alignItems: "center"
          }}>
            Go to Lobby
          </Link>
        )}
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pulse-orb {
          0% { transform: scale(0.95); opacity: 0.8; }
          50% { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(0.95); opacity: 0.8; }
        }
        @keyframes spin {
          0% { background-position: 0 0; }
          100% { background-position: 36px 36px; }
        }
      `}} />
    </div>
  );
}
