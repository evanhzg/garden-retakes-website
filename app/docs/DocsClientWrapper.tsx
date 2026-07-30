"use client";

import { useEffect } from "react";

export default function DocsClientWrapper({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.body.classList.add("is-docs-page");
    return () => document.body.classList.remove("is-docs-page");
  }, []);

  return <>{children}</>;
}
