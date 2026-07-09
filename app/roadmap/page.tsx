import fs from "node:fs";
import path from "node:path";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const metadata = {
  title: "Roadmap — Garden Retakes",
  description: "Everything shipped and everything coming to the Garden Retakes server.",
};

// The markdown mirror is bundled with the deploy; no revalidation needed.
export const dynamic = "force-static";

function loadRoadmap(): string {
  const filePath = path.join(process.cwd(), "content", "roadmap.md");
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "# Roadmap\n\nThe roadmap file is missing from this deployment.";
  }
}

export default function RoadmapPage() {
  const markdown = loadRoadmap();

  return (
    <>
      <section className="hero hero-compact">
        <div className="hero-inner">
          <span className="eyebrow">Roadmap</span>
          <h1>
            What&apos;s <span className="grad">done</span> &amp; what&apos;s{" "}
            <span className="grad">coming</span>.
          </h1>
          <p className="muted">
            The live development roadmap of the whole Garden ecosystem — plugin, website,
            Discord bot. Checked boxes are already on the server.
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
