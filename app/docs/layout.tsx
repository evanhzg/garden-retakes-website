import "./docs.css";
import Link from "next/link";
import { headers } from "next/headers";

export const metadata = {
  title: "REEEETAKES — Docs",
  description: "Documentation for Plugins, Games, Website, and APIs",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', maxWidth: '1400px', margin: '0 auto', padding: '100px 24px 64px' }}>
        {children}
      </main>
    </div>
  );
}
