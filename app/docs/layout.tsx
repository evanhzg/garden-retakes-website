import Link from "next/link";
import { DOC_SECTIONS } from "@/lib/apiDocs";
import "./docs.css";

export const metadata = {
  title: "Garden Retakes — API Docs",
  description: "API and socket protocol documentation for retakes.fr",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="docs-layout">
      <aside className="docs-sidebar glass-panel">
        <Link href="/docs" className="docs-logo">
          <span className="docs-logo-mark">🌱</span>
          <span>
            <strong>Garden API</strong>
            <small>docs.retakes.fr</small>
          </span>
        </Link>
        <nav className="docs-nav">
          <Link href="/docs" className="docs-nav-link">Overview</Link>
          {DOC_SECTIONS.map((s) => (
            <Link key={s.slug} href={`/docs/${s.slug}`} className="docs-nav-link">
              {s.title}
            </Link>
          ))}
        </nav>
        <div className="docs-sidebar-footer">
          <Link href="/">← retakes.fr</Link>
        </div>
      </aside>
      <main className="docs-main">{children}</main>
    </div>
  );
}
