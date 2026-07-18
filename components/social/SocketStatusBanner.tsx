"use client";

import React, { useEffect, useState, useRef } from "react";
import { useSocket } from "../games/SocketProvider";
import { motion, AnimatePresence } from "framer-motion";
import { Wifi, Loader2 } from "lucide-react";

export default function SocketStatusBanner() {
  const { isConnected } = useSocket();
  const [status, setStatus] = useState<"connecting" | "connected" | "hidden">("hidden");
  const [cooldown, setCooldown] = useState(60);
  const wasDisconnected = useRef(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (!isConnected) {
      wasDisconnected.current = true;
      setStatus("connecting");
      setCooldown(60); // Reset to 60s
      
      interval = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      // If we just connected and it was previously disconnected
      if (wasDisconnected.current) {
         setStatus("connected");
         setTimeout(() => setStatus("hidden"), 3500);
         wasDisconnected.current = false;
      }
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isConnected]);

  return (
    <AnimatePresence>
      {status !== "hidden" && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0, transition: { duration: 0.2 } }}
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-2.5 rounded-full flex items-center gap-3 shadow-lg font-medium backdrop-blur-md border ${
            status === "connecting" 
              ? "bg-amber-500/10 border-amber-500/20 text-amber-200 shadow-amber-500/5" 
              : "bg-emerald-500/10 border-emerald-500/20 text-emerald-200 shadow-emerald-500/5"
          }`}
        >
          {status === "connecting" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
              <span className="text-sm">Waking up game server... ({cooldown}s)</span>
            </>
          ) : (
            <>
              <Wifi className="w-4 h-4 text-emerald-400" />
              <span className="text-sm">Sockets up! Server is online.</span>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
