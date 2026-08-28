"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import ServerConsole from "./ServerConsole";
import StatusTag from "./StatusTag";
import "./consoles.css";

// Every server, each with its own console.
//
// One console at a time rather than six stacked down the page. Six polling logs
// is six requests every couple of seconds for five answers nobody is reading,
// and a page of six identical black boxes is one you have to read carefully to
// use at all — which is the opposite of what a console is for at an event.
//
// So: a list you pick from, showing the name, the address and what each server
// is doing, and one console for whichever is selected.

type Server = {
  id: number;
  name: string;
  host: string;
  port: number;
  connectAddress: string | null;
  gotvAddress: string | null;
  status: string;
  currentMatchId: number | null;
  isTournament: boolean;
};

export default function ServerConsoles({ adminKey }: { adminKey?: string }) {
  const { t } = useI18n();

  const [servers, setServers] = useState<Server[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const q = adminKey ? `?key=${encodeURIComponent(adminKey)}` : "";
      const res = await fetch(`/api/admin/servers${q}`, { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Not authorized.");
        return;
      }

      setError(null);
      setServers(data.servers ?? []);
    } catch (err) {
      setError(String(err));
    }
  }, [adminKey]);

  useEffect(() => {
    load();
    // Slow: this is the list, not the console. What changes here is a server
    // going busy, which matters within ten seconds and not within one.
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [load]);

  // Open on the first server that is actually doing something, else the first
  // one. Somebody arriving here mid-event wants the busy one.
  useEffect(() => {
    if (selected !== null || servers.length === 0) return;
    setSelected((servers.find((s) => s.currentMatchId !== null) ?? servers[0]).id);
  }, [servers, selected]);

  if (error) return <p className="muted">{error}</p>;
  if (servers.length === 0) return <p className="muted">{t("consoles.none")}</p>;

  const current = servers.find((s) => s.id === selected) ?? null;

  return (
    <div className="cnss">
      <ul className="cnss-list">
        {servers.map((s) => (
          <li key={s.id}>
            <button
              className={`cnss-pick ${s.id === selected ? "on" : ""}`}
              aria-pressed={s.id === selected}
              onClick={() => setSelected(s.id)}
            >
              <span className="cnss-name">{s.name}</span>
              <span className="cnss-addr">
                {s.connectAddress || `${s.host}:${s.port}`}
              </span>

              <span className="cnss-meta">
                <StatusTag kind="server" value={s.status} className="compact" />
                {/* Which match it is on, because "busy" alone does not tell you
                    whether it is yours. */}
                {s.currentMatchId !== null && (
                  <span className="cnss-match num">#{s.currentMatchId}</span>
                )}
                {!s.isTournament && <span className="cnss-tag">{t("consoles.ladder")}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {current && (
        <ServerConsole
          key={current.id}
          serverId={current.id}
          adminKey={adminKey}
          title={current.name}
          subtitle={current.connectAddress || `${current.host}:${current.port}`}
        />
      )}
    </div>
  );
}
