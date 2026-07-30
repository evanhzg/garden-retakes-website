import Link from "next/link";
import { DOC_SECTIONS } from "@/lib/apiDocs";
import "./docs.css";
import DocsNav from "./DocsNav";
import fs from "fs";
import path from "path";

export const metadata = {
  title: "Garden Retakes — Docs",
  description: "Documentation for Plugins, Games, Website, and APIs",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  // Read MD files dynamically for the sidebar
  const contentDir = path.join(process.cwd(), "content/docs");
  let navStructure: Record<string, string[]> = {
    Plugins: [],
    Games: [],
    Website: [],
  };

  try {
    if (fs.existsSync(contentDir)) {
      const dirs = fs.readdirSync(contentDir);
      for (const dir of dirs) {
        const dirPath = path.join(contentDir, dir);
        if (fs.statSync(dirPath).isDirectory()) {
          const files = fs.readdirSync(dirPath)
            .filter(f => f.endsWith(".md"))
            .map(f => f.replace(".md", ""));
            
          // Map directory name to proper capitalization if possible
          const catName = dir.charAt(0).toUpperCase() + dir.slice(1);
          navStructure[catName] = files;
        }
      }
    }
  } catch (e) {
    console.error(e);
  }

  return (
    <div className="docs-layout">
      <DocsNav navStructure={navStructure} apiSections={DOC_SECTIONS} />
      <main className="docs-main">{children}</main>
    </div>
  );
}
