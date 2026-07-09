import fs from "node:fs";
import path from "node:path";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const metadata = {
  title: "Commands — Garden Retakes",
  description: "Every chat and console command available on the Garden Retakes server.",
};

export const dynamic = "force-static";

function loadCommands(): string {
  const filePath = path.join(process.cwd(), "content", "commands.md");
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "# Commands\n\nThe commands file is missing from this deployment.";
  }
}

export default function CommandsPage() {
  const markdown = loadCommands();

  return (
    <>
      <section className="hero hero-compact">
        <div className="hero-inner">
          <span className="eyebrow">Commands</span>
          <h1>
            Every <span className="grad">command</span> on the server.
          </h1>
          <p className="muted">
            Chat commands work with <code>!</code> or <code>/</code>; each also exists in
            console as <code>css_*</code>. Mirrored from the plugin&apos;s COMMANDS.md.
          </p>
        </div>
      </section>

      <div className="panel roadmap-panel">
        <div className="roadmap-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        </div>
      </div>
    </>
  );
}
