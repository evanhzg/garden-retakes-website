"use client";

import React, { useEffect, useState, useRef } from "react";
import { useSocket } from "../games/SocketProvider";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from '@/components/I18nProvider';
import { Wifi, Loader2 } from "lucide-react";

/**
 * Whether the socket is up, as a pill over the top of the page.
 *
 * It was written in Tailwind — `fixed top-6 left-1/2 -translate-x-1/2 z-[100]`
 * and a dozen more — and this project has never had Tailwind installed. Every
 * one of those classes was inert, so the pill was not fixed, not centred, not
 * round and not coloured: it was a plain static block at the end of <body>,
 * which is a flex column. It therefore took 31px of the app shell's height on
 * every page, pushing the scroll container up by exactly that much and leaving
 * a strip of empty background under the footer. That strip is the whole reason
 * the footer never sat at the bottom.
 *
 * Real classes now, in globals.css with everything else.
 */
export default function SocketStatusBanner() {
    const { t } = useI18n();

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
          className={`sock-banner ${status}`}
          role="status"
          aria-live="polite"
        >
          {status === "connecting" ? (
            <>
              <Loader2 size={15} className="sock-banner-spin" aria-hidden />
              <span>{t("auto.socketstatusbanner.waking_up_game_server")}{cooldown}{t("auto.socketstatusbanner.s")}</span>
            </>
          ) : (
            <>
              <Wifi size={15} aria-hidden />
              <span>{t("auto.socketstatusbanner.sockets_up_server_is_online")}</span>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
