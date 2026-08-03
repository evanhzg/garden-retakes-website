"use client";

import { useEffect, useState } from "react";
import { PROVIDERS, PROVIDER_PATHS, providerById, type Connection, type ProviderId } from "@/lib/connections";
import { useToast } from "@/components/Toast";

// Connections, at the top of a profile where "who is this person elsewhere"
// belongs — it used to be a Discord button alone, near the bottom.
//
// Everything is private until it is published. A link nobody chose to show is
// not shown, including the ones we already know like Discord and FACEIT: we
// knowing something is not the same as them wanting it on a public page.

function Mark({ provider }: { provider: ProviderId }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden focusable="false">
      <path d={PROVIDER_PATHS[provider]} />
    </svg>
  );
}

/** The read-only bar shown on any profile. */
export function ConnectionsBar({ steamId }: { steamId: string }) {
  const [links, setLinks] = useState<Connection[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/profile/links?steamId=${steamId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => !cancelled && setLinks((j.connections ?? []).filter((c: Connection) => c.public)))
      .catch(() => !cancelled && setLinks([]));
    return () => {
      cancelled = true;
    };
  }, [steamId]);

  // Nothing published is not an error state; it just takes no room.
  if (!links || links.length === 0) return null;

  return (
    <div className="conn-bar">
      {links.map((c) => {
        const p = providerById(c.provider);
        if (!p) return null;
        const inner = (
          <>
            <Mark provider={c.provider} />
            <span>{c.handle && !p.derived ? c.handle.replace(/^@/, "") : p.label}</span>
          </>
        );
        return c.href ? (
          <a
            key={c.provider}
            className="conn-chip"
            style={{ ["--brand" as string]: p.colour }}
            href={c.href}
            target="_blank"
            rel="noreferrer noopener"
          >
            {inner}
          </a>
        ) : (
          <span key={c.provider} className="conn-chip is-flat" style={{ ["--brand" as string]: p.colour }}>
            {inner}
          </span>
        );
      })}
    </div>
  );
}

/** The editor, on your own profile. */
export default function ConnectionsEditor() {
  const [links, setLinks] = useState<Record<string, { handle: string; public: boolean }>>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetch("/api/profile/links", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const map: Record<string, { handle: string; public: boolean }> = {};
        for (const c of (j.connections ?? []) as Connection[]) {
          map[c.provider] = { handle: c.handle ?? "", public: c.public };
        }
        setLinks(map);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const set = (id: string, patch: Partial<{ handle: string; public: boolean }>) =>
    setLinks((cur) => ({ ...cur, [id]: { ...{ handle: "", public: false }, ...cur[id], ...patch } }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/profile/links", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          connections: PROVIDERS.map((p) => ({
            provider: p.id,
            handle: links[p.id]?.handle ?? "",
            public: links[p.id]?.public ?? false,
          })),
        }),
      });
      toast(res.ok ? "Saved." : "Could not save.", res.ok ? "ok" : "error");
    } catch {
      toast("Network error.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <p className="muted">Loading connections…</p>;

  return (
    <div className="conn-editor">
      <p className="pro-settings-hint" style={{ marginTop: 0 }}>
        Nothing here is shown until you publish it — including Steam, Discord and FACEIT.
      </p>

      <ul>
        {PROVIDERS.map((p) => {
          const row = links[p.id] ?? { handle: "", public: false };
          return (
            <li key={p.id} style={{ ["--brand" as string]: p.colour }}>
              <span className="conn-editor-mark"><Mark provider={p.id} /></span>
              <span className="conn-editor-label">{p.label}</span>

              {p.derived && p.id !== "faceit" ? (
                <span className="conn-editor-known">{row.handle || "linked"}</span>
              ) : (
                <input
                  className="input"
                  value={row.handle}
                  placeholder={p.placeholder ?? (p.id === "faceit" ? "FACEIT nickname" : "")}
                  maxLength={160}
                  onChange={(e) => set(p.id, { handle: e.target.value })}
                />
              )}

              <label className="conn-editor-toggle">
                <input type="checkbox" checked={row.public} onChange={(e) => set(p.id, { public: e.target.checked })} />
                Public
              </label>
            </li>
          );
        })}
      </ul>

      <div className="clip-form-actions">
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save connections"}
        </button>
      </div>
    </div>
  );
}
