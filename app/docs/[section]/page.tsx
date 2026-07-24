import { notFound } from "next/navigation";
import { DOC_SECTIONS, getDocSection } from "@/lib/apiDocs";

export function generateStaticParams() {
  return DOC_SECTIONS.map((s) => ({ section: s.slug }));
}

export function generateMetadata({ params }: { params: { section: string } }) {
  const section = getDocSection(params.section);
  return { title: section ? `${section.title} — Garden API Docs` : "Garden API Docs" };
}

export default function DocsSectionPage({ params }: { params: { section: string } }) {
  const section = getDocSection(params.section);
  if (!section) notFound();

  return (
    <article className="docs-article">
      <h1>{section.title}</h1>
      <p className="docs-lead">{section.intro}</p>

      {section.endpoints?.map((ep) => (
        <section key={`${ep.method} ${ep.path}`} className="endpoint-card glass-panel" id={ep.path}>
          <div className="endpoint-head">
            <span className={`method method-${ep.method.toLowerCase()}`}>{ep.method}</span>
            <code className="endpoint-path">{ep.path}</code>
          </div>
          <p className="endpoint-summary">{ep.summary}</p>
          <div className="endpoint-auth">
            <span className="auth-label">Auth</span> {ep.auth}
          </div>

          {ep.params && ep.params.length > 0 && (
            <div className="endpoint-block">
              <h4>Parameters</h4>
              <div className="param-table-wrap">
                <table className="param-table">
                  <thead>
                    <tr><th>Name</th><th>In</th><th>Type</th><th>Description</th></tr>
                  </thead>
                  <tbody>
                    {ep.params.map((p) => (
                      <tr key={p.name}>
                        <td><code>{p.name}</code>{p.required && <span className="req">*</span>}</td>
                        <td>{p.in}</td>
                        <td><code>{p.type}</code></td>
                        <td>{p.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {ep.requestExample && (
            <div className="endpoint-block">
              <h4>Request</h4>
              <pre className="docs-code"><code>{ep.requestExample}</code></pre>
            </div>
          )}

          {ep.responseExample && (
            <div className="endpoint-block">
              <h4>Response</h4>
              <pre className="docs-code"><code>{ep.responseExample}</code></pre>
            </div>
          )}

          {ep.notes && ep.notes.length > 0 && (
            <ul className="endpoint-notes">
              {ep.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}
        </section>
      ))}

      {section.socketEvents && (
        <div className="param-table-wrap">
          <table className="param-table socket-table">
            <thead>
              <tr><th>Direction</th><th>Event</th><th>Payload</th><th>Description</th></tr>
            </thead>
            <tbody>
              {section.socketEvents.map((ev) => (
                <tr key={ev.name}>
                  <td className={ev.direction === "client→server" ? "dir-c2s" : "dir-s2c"}>
                    {ev.direction}
                  </td>
                  <td><code>{ev.name}</code></td>
                  <td><code>{ev.payload}</code></td>
                  <td>{ev.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
