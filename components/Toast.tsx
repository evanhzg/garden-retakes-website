"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
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

  /**
   * Whether the portal may exist yet.
   *
   * THIS IS THE SITE'S HYDRATION ERROR. The portal used to be gated on
   * `typeof document !== "undefined"`, which is false while rendering on the
   * server and true on the client's very first render — so the server sent a
   * <body> without .toast-stack and the client's first pass produced one, in
   * <body>, which is a container React is hydrating. It could not claim the
   * node it expected, threw "Hydration failed because the initial UI does not
   * match", and because the failure was above every Suspense boundary React
   * threw away the server's markup and re-rendered the WHOLE page on the
   * client. Every page. Every load. Since the toast was written.
   *
   * A state flag set in an effect is the fix: the first client render matches
   * the server exactly — no portal — and the portal appears on the render
   * after hydration has finished, which is a normal update rather than a
   * disagreement about what the server said.
   */
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const push = useCallback((text: string, kind: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((cur) => [...cur, { id, text, kind }]);
    setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 3200);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      {ready &&
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
