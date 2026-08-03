"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { createPortal } from "react-dom";

// Transient confirmations, bottom right.
//
// A "Saved." rendered inline pushed the buttons under it down by a line every
// time you saved — the confirmation moved the thing you were about to click
// next. A toast says the same thing without touching the layout.

type Toast = { id: number; text: string; kind: "ok" | "error" };
const ToastContext = createContext<(text: string, kind?: "ok" | "error") => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((text: string, kind: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((cur) => [...cur, { id, text, kind }]);
    setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 3200);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          <div className="toast-stack" aria-live="polite">
            {toasts.map((t) => (
              <div key={t.id} className={`toast-item ${t.kind}`}>{t.text}</div>
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
