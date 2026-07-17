"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface RoadmapSection {
  title: string;
  cleanTitle: string; // Title without "1. " etc.
  content: string;
}

interface Props {
  intro: string;
  sections: RoadmapSection[];
}

export default function RoadmapClient({ intro, sections }: Props) {
  const [activeTab, setActiveTab] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSections = sections.filter(
    (s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="panel roadmap-panel page-enter">
      <div className="roadmap-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{intro}</ReactMarkdown>

        <div style={{ marginTop: "24px", marginBottom: "20px" }}>
          <input
            type="text"
            className="input"
            placeholder="Search roadmap..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {searchQuery === "" && (
          <div className="chip-row">
            {sections.map((section, idx) => (
              <button
                key={idx}
                className={`chip ${activeTab === idx ? "active" : ""}`}
                onClick={() => setActiveTab(idx)}
              >
                {section.cleanTitle}
              </button>
            ))}
          </div>
        )}

        <div style={{ marginTop: "24px" }}>
          {(searchQuery !== "" ? filteredSections : [sections[activeTab]]).map((section, idx) => {
            if (!section) return null;
            return (
              <div key={idx} style={{ marginBottom: "32px", animation: "fadeInUp 0.3s ease" }}>
                <h2 style={{ paddingBottom: "8px", borderBottom: "1px solid var(--border)", marginBottom: "16px" }}>
                  {section.title}
                </h2>
                <div className="roadmap-markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {section.content}
                  </ReactMarkdown>
                </div>
              </div>
            );
          })}

          {searchQuery !== "" && filteredSections.length === 0 && (
            <div className="empty-hint">No matches found for "{searchQuery}".</div>
          )}
        </div>
      </div>
    </div>
  );
}
