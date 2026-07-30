import "./docs.css";
import Link from "next/link";
import type { Metadata } from "next";
import DocsClientWrapper from "./DocsClientWrapper";

export const metadata: Metadata = {
  title: "REEEETAKES Docs",
  description: "Documentation for Plugins, Games, Website, and APIs",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', padding: '0' }}>
        <DocsClientWrapper>{children}</DocsClientWrapper>
      </main>
    </div>
  );
}
