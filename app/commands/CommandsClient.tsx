"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";

export interface CommandItem {
  command: string;
  level?: string;
  description: string;
}

export interface CommandCategory {
  name: string;
  description: string;
  commands: CommandItem[];
}

interface Props {
  intro: string;
  categories: CommandCategory[];
}

export default function CommandsClient({ intro, categories }: Props) {
  const [activeTab, setActiveTab] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    // Strip backticks if any
    const clean = text.replace(/`/g, "");
    // If it has multiple commands like `!ak` / `!ak47`, just take the first one
    const firstCmd = clean.split("/")[0].trim();
    // And remove any arguments like <name>
    const justCmd = firstCmd.split(" ")[0];

    navigator.clipboard.writeText(justCmd).then(() => {
      setToastMessage(`Copied ${justCmd} to clipboard`);
      setTimeout(() => setToastMessage(null), 2500);
    });
  };

  const filteredCategories = categories.map(cat => ({
    ...cat,
    commands: cat.commands.filter(cmd => 
      cmd.command.toLowerCase().includes(searchQuery.toLowerCase()) || 
      cmd.description.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(cat => cat.commands.length > 0 || (searchQuery === '' && cat.commands.length === 0)); // keep empty cats only if no search

  return (
    <div className="panel roadmap-panel page-enter">
      <div className="roadmap-content">
        <ReactMarkdown>{intro}</ReactMarkdown>
        
        <div style={{ marginTop: "24px", marginBottom: "20px" }}>
          <input 
            type="text" 
            className="input" 
            placeholder="Search commands..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {searchQuery === "" && (
          <div className="chip-row">
            {categories.map((cat, idx) => (
              <button 
                key={idx} 
                className={`chip ${activeTab === idx ? "active" : ""}`}
                onClick={() => setActiveTab(idx)}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

        <div style={{ marginTop: "24px" }}>
          {(searchQuery !== "" ? filteredCategories : [categories[activeTab]]).map((cat, idx) => {
            if (!cat) return null;
            return (
              <div key={idx} style={{ marginBottom: "32px", animation: "fadeInUp 0.3s ease" }}>
                {searchQuery !== "" && <h3>{cat.name}</h3>}
                
                {cat.description && (
                  <div className="muted" style={{ marginBottom: "16px", fontSize: "0.9rem" }}>
                    <ReactMarkdown>{cat.description}</ReactMarkdown>
                  </div>
                )}

                {cat.commands.length > 0 ? (
                  <div style={{ overflowX: "auto" }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Command</th>
                          {cat.commands.some(c => c.level) && <th>Level</th>}
                          <th>Description</th>
                          <th style={{ width: "80px", textAlign: "right" }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cat.commands.map((cmd, cIdx) => (
                          <tr key={cIdx}>
                            <td style={{ whiteSpace: "nowrap" }}>
                              <ReactMarkdown components={{ p: ({node, ...props}) => <span {...props}/> }}>
                                {cmd.command}
                              </ReactMarkdown>
                            </td>
                            {cat.commands.some(c => c.level) && <td>{cmd.level || "—"}</td>}
                            <td>
                              <ReactMarkdown components={{ p: ({node, ...props}) => <span {...props}/> }}>
                                {cmd.description}
                              </ReactMarkdown>
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <button 
                                className="btn small secondary" 
                                onClick={() => copyToClipboard(cmd.command)}
                                style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                              >
                                Copy
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-hint">No commands listed here.</div>
                )}
              </div>
            );
          })}
          
          {searchQuery !== "" && filteredCategories.length === 0 && (
            <div className="empty-hint">No commands found for "{searchQuery}".</div>
          )}
        </div>
      </div>

      {toastMessage && (
        <div className="toast">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
