import Link from "next/link";
import { DOC_SECTIONS } from "@/lib/apiDocs";

export default function DocsOverview() {
  return (
    <article className="docs-article">
      <h1>Garden Retakes API</h1>
      <p className="docs-lead">
        Everything the retakes.fr website, the CS2 plugins and the Games Hub speak over HTTP and
        WebSockets. Base URL: <code>https://retakes.fr</code>.
      </p>

      <h2>Conventions</h2>
      <ul>
        <li>All HTTP endpoints live under <code>/api/…</code> and speak JSON unless noted.</li>
        <li>SteamIDs are always <strong>SteamID64 strings</strong> (e.g. <code>76561198012345678</code>).</li>
        <li>
          Browser auth is a signed <code>garden_session</code> HttpOnly cookie set by Steam OpenID
          login — see <Link href="/docs/auth">Authentication</Link>.
        </li>
        <li>
          Server↔server calls (game plugin → website) use the shared <code>INVSIM_API_KEY</code>{" "}
          secret, sent in the JSON body or as <code>?key=</code> on admin routes.
        </li>
        <li>Errors return a non-2xx status with <code>{"{ \"error\": \"message\" }"}</code>.</li>
      </ul>

      <h2>Sections</h2>
      <div className="docs-section-grid">
        {DOC_SECTIONS.map((s) => (
          <Link key={s.slug} href={`/docs/${s.slug}`} className="docs-section-card glass-panel">
            <h3>{s.title}</h3>
            <p>{s.intro.length > 140 ? s.intro.slice(0, 137) + "…" : s.intro}</p>
            <span className="docs-count">
              {s.endpoints ? `${s.endpoints.length} endpoints` : `${s.socketEvents?.length ?? 0} events`}
            </span>
          </Link>
        ))}
      </div>

      <h2>Keeping docs honest</h2>
      <p>
        These pages render from a single source file (<code>lib/apiDocs.ts</code>). Any commit that
        adds or changes an API route or socket event must update that file too.
      </p>
    </article>
  );
}
