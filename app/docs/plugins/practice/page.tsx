import Link from "next/link";
import fs from "fs";
import path from "path";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "../../docs.css"; // Ensure docs CSS is loaded

export const metadata = { title: "Practice Mode — Plugins" };

export default function PracticeVitrine() {
  const contentDir = path.join(process.cwd(), "content/docs/plugins");
  const filePath = path.join(contentDir, `Commands.md`);
  let commandsContent = "";
  if (fs.existsSync(filePath)) {
    commandsContent = fs.readFileSync(filePath, "utf-8");
  }

  return (
    <div style={{ width: '100%' }}>
      <Link href="/docs" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--muted)', textDecoration: 'none', marginBottom: '32px', fontWeight: 600 }}>
        <span>←</span> Back to Docs
      </Link>

      {/* Hero Section */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '64px 0', background: 'radial-gradient(circle at center, rgba(168, 85, 247, 0.1), transparent 70%)', borderRadius: '32px', marginBottom: '64px', border: '1px solid var(--border)' }}>
        <img src="/images/modes/practice.jpg" alt="Practice Logo" style={{ width: '160px', height: '160px', borderRadius: '40px', boxShadow: 'var(--shadow)', marginBottom: '32px', border: '4px solid color-mix(in srgb, var(--panel) 50%, transparent)' }} />
        <h1 style={{ fontSize: '4rem', fontWeight: 900, color: 'var(--text)', marginBottom: '16px', letterSpacing: '-2px' }}>PRACTICE MODE</h1>
        <p style={{ fontSize: '1.4rem', color: 'var(--muted)', maxWidth: '800px', lineHeight: 1.5 }}>
          The ultimate sandbox for mastering nade lineups, prefire paths, and coordinated team drills. Designed for pros, built for everyone.
        </p>
      </div>

      {/* Features Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px', marginBottom: '64px' }}>
        <div style={{ background: 'color-mix(in srgb, var(--panel) 40%, transparent)', padding: '32px', borderRadius: '24px', border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent)', marginBottom: '12px' }}>Nade Book</h3>
          <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>Built-in library of essential lineups for all active duty maps. Save your own nades, set scoring targets, and start smoke challenges to perfect your throws.</p>
        </div>
        <div style={{ background: 'color-mix(in srgb, var(--panel) 40%, transparent)', padding: '32px', borderRadius: '24px', border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent)', marginBottom: '12px' }}>Prefire Runs</h3>
          <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>Sharpen your entry pathing. Bots spawn in common holding positions along specific routes. Clear them out as quickly and accurately as possible.</p>
        </div>
        <div style={{ background: 'color-mix(in srgb, var(--panel) 40%, transparent)', padding: '32px', borderRadius: '24px', border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent)', marginBottom: '12px' }}>Team Drills</h3>
          <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>Practice executes, crossfires, and synced entries with your teammates in a multiplayer sandbox environment without the pressure of a real match.</p>
        </div>
      </div>

      {/* Commands / MD Integration */}
      <div style={{ background: 'var(--panel)', padding: '48px', borderRadius: '32px', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
        <h2 style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--text)', marginBottom: '32px' }}>Mode Reference</h2>
        <article className="docs-article">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {commandsContent}
          </ReactMarkdown>
        </article>
      </div>
    </div>
  );
}
