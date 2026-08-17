"use client";

import { useCallback, useEffect, useState } from "react";
import { Shield, Bot, Users, RefreshCw, AlertTriangle, Check } from "lucide-react";

// The Defender tab.
//
// Read-only on purpose. Every other Maker tab edits rows in this database, but
// a Defender scenario is a schedule of timed bot routes authored by walking
// them in game — there is no browser gesture for "the entry arrives at 12.4s
// having taken this corner", and a form that pretended otherwise would produce
// scenarios that look authored and play like nothing.
//
// So this is the half a browser is good at: seeing what exists on the running
// server, seeing why one is not ready, and pressing Test.

type Scenario = {
  name: string;
  site: string;
  slots: number;
  bots: number;
  state: string;
  ready: boolean;
};

export default function GameMakerDefender({ adminKey }: { adminKey?: string }) {
  const [map, setMap] = useState("");
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const key = adminKey ? `key=${encodeURIComponent(adminKey)}` : "";

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/game-maker/defender?${key}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not read the server.");
        setScenarios([]);
        return;
      }
      setError("");
      setMap(json.map ?? "");
      setScenarios(json.scenarios ?? []);
    } catch {
      setError("Could not reach the server.");
      setScenarios([]);
    }
  }, [key]);

  useEffect(() => {
    load();
  }, [load]);

  const test = async (name: string, fill: "bots" | "wait") => {
    if (busy) return;
    setBusy(`${name}:${fill}`);
    setNote(null);
    try {
      const res = await fetch(`/api/admin/game-maker/test?${key}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "defender", name, fill }),
      });
      const json = await res.json();
      setNote({ ok: res.ok && json.ok !== false, text: json.message ?? json.error ?? "Done." });
    } catch {
      setNote({ ok: false, text: "Could not reach the server." });
    } finally {
      setBusy(null);
      setTimeout(() => setNote(null), 6000);
    }
  };

  return (
    <div className="gmd">
      <p className="gm-blurb">
        Scenarios are authored in game — <code>!gmode maker</code>, <code>!maker mode defender</code>, then walk each
        bot&apos;s route with <code>!maker rec</code>. Their timings are the walk you actually did, which is why there
        is no form here. This is the list the running server has on{" "}
        <strong>{map || "its current map"}</strong>, and the button that plays one.
      </p>

      <div className="gmu-top">
        <span className="gm-chip">
          <Shield size={11} /> {scenarios?.length ?? 0} scenario(s)
        </span>
        <button className="btn btn-ghost gmu-refresh" onClick={load} title="Ask the server again">
          <RefreshCw size={14} />
        </button>
      </div>

      {error && <p className="gm-error">{error}</p>}
      {note && <p className={`gm-testnote ${note.ok ? "ok" : "bad"}`}>{note.text}</p>}

      {scenarios === null ? (
        <p className="muted">Asking the server…</p>
      ) : scenarios.length === 0 && !error ? (
        <p className="empty-hint">
          Nothing authored on this map yet. In game: <code>!maker mode defender</code>, then{" "}
          <code>!maker new a &lt;name&gt;</code>.
        </p>
      ) : (
        <ul className="gmd-list">
          {scenarios.map((s) => (
            <li key={s.name} className={s.ready ? "" : "blocked"}>
              <div className="gmd-head">
                <span className="gmd-name">{s.name}</span>
                <span className="gm-chip site">{s.site}</span>
              </div>
              <div className="gmd-meta">
                <span>{s.slots} defender spot(s)</span>
                <span>{s.bots} bot(s)</span>
              </div>
              <p className={`gmd-state ${s.ready ? "ok" : "bad"}`}>
                {s.ready ? <Check size={12} /> : <AlertTriangle size={12} />} {s.state}
              </p>
              <div className="gm-test">
                <button className="gm-testbtn" disabled={!s.ready || busy !== null} onClick={() => test(s.name, "wait")}>
                  <Users size={13} /> {busy === `${s.name}:wait` ? "Starting…" : "Test"}
                </button>
                <button
                  className="gm-testbtn ghost"
                  disabled={!s.ready || busy !== null}
                  onClick={() => test(s.name, "bots")}
                >
                  <Bot size={13} /> {busy === `${s.name}:bots` ? "…" : "Bots"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
