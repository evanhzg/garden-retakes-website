"use client";

import { useEffect, useState } from "react";

type Status = { signedIn: boolean; configured: boolean; linked: boolean; name?: string | null; avatar?: string | null };

// Profile "Connections" card: link / unlink a Discord account. The OAuth flow
// lives in /api/auth/discord/*; this just reflects and toggles the link.
export default function DiscordConnect() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetch("/api/auth/discord/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ signedIn: false, configured: false, linked: false }));

  useEffect(() => { load(); }, []);

  // Surface the ?discord=… result from the callback redirect, then clean the URL.
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("discord");
    if (!q) return;
    const msg: Record<string, string> = {
      linked: "Discord connected ✓",
      failed: "Discord link failed — try again.",
      error: "Couldn't save the link. Is the DB reachable?",
      unconfigured: "Discord isn't configured on the server yet.",
      signin: "Sign in with Steam first.",
    };
    setNotice(msg[q] ?? null);
    const url = new URL(window.location.href);
    url.searchParams.delete("discord");
    window.history.replaceState({}, "", url.toString());
  }, []);

  const unlink = async () => {
    setBusy(true);
    try { await fetch("/api/auth/discord/unlink", { method: "POST" }); await load(); }
    finally { setBusy(false); }
  };

  if (!status) return null;

  return (
    <div className="discord-connect">
      <div className="discord-connect-head">
        <span className="discord-glyph" aria-hidden>
          <svg viewBox="0 0 24 18" width="26" height="20" fill="currentColor">
            <path d="M20.3 1.6A19.8 19.8 0 0 0 15.4.1a14 14 0 0 0-.6 1.3 18.3 18.3 0 0 0-5.5 0A13.9 13.9 0 0 0 8.6.1 19.8 19.8 0 0 0 3.7 1.6C.6 6.2-.3 10.6.2 15a19.9 19.9 0 0 0 6 3 14.7 14.7 0 0 0 1.3-2.1 12.9 12.9 0 0 1-2-1c.2-.1.3-.3.5-.4a14.2 14.2 0 0 0 12.1 0l.5.4a12.9 12.9 0 0 1-2 1A14.6 14.6 0 0 0 17.8 18a19.8 19.8 0 0 0 6-3c.6-5.2-.8-9.5-3.5-13.4ZM8 12.3c-1.2 0-2.1-1.1-2.1-2.4S6.8 7.5 8 7.5s2.2 1.1 2.1 2.4-.9 2.4-2.1 2.4Zm8 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4-.9 2.4-2.1 2.4Z" />
          </svg>
        </span>
        <div>
          <h3>Discord</h3>
          <p>
            {status.linked ? "Connected — used for game invites." : "Link your Discord to join games from your server."}
          </p>
        </div>
      </div>

      {notice && <div className="discord-notice">{notice}</div>}

      {status.linked ? (
        <div className="discord-linked">
          <div className="discord-user">
            {status.avatar ? <img src={status.avatar} alt="" /> : <span className="discord-user-fallback">{(status.name || "?").charAt(0).toUpperCase()}</span>}
            <span className="discord-user-name">{status.name}</span>
          </div>
          <button className="discord-btn ghost" onClick={unlink} disabled={busy}>
            {busy ? "…" : "Unlink"}
          </button>
        </div>
      ) : (
        <a
          className={`discord-btn ${status.configured ? "" : "disabled"}`}
          href={status.configured ? "/api/auth/discord/login" : undefined}
          aria-disabled={!status.configured}
          onClick={(e) => { if (!status.configured) e.preventDefault(); }}
          title={status.configured ? "Link Discord" : "Discord isn't configured on the server yet"}
        >
          Connect Discord
        </a>
      )}
    </div>
  );
}
