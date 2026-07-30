import fs from "fs";
import path from "path";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "../docs.css"; // Ensure docs CSS is loaded

export async function generateMetadata({ params }: { params: { category: string, slug: string } }) {
  return { title: `${params.slug.replace(/-/g, " ")} — ${params.category} Docs` };
}

export default function MarkdownDocPage({ params }: { params: { category: string, slug: string } }) {
  const { category, slug } = params;
  
  const contentDir = path.join(process.cwd(), "content/docs", category);
  const filePath = path.join(contentDir, `${slug}.md`);

  if (!fs.existsSync(filePath)) {
    notFound();
  }

  const content = fs.readFileSync(filePath, "utf-8");

  return (
    <article className="docs-article glass-panel" style={{ padding: '32px', margin: '32px 0', borderRadius: '16px' }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </article>
  );
}
