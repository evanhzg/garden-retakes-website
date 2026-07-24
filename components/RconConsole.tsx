"use client";

import { useRef, useState } from "react";

type Line = { cmd: string; out: string; error: boolean };

const QUICK = ["status", "css_gamemode", "bot_quota 0", "mp_restartgame 1"];

export default function RconConsole({ adminKey }: { adminKey?: string }) {
  const [command, setCommand] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const run = async (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/rcon", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command: trimmed, key: adminKey }),
      });
      const json = await res.json();
      const line: Line = res.ok
        ? { cmd: trimmed, out: json.output || "(no output)", error: false }
        : { cmd: trimmed, out: json.error ?? "Failed.", error: true };
      setLines((prev) => [...prev, line]);
    } catch {
      setLines((prev) => [...prev, { cmd: trimmed, out: "Network error.", error: true }]);
    } finally {
      setBusy(false);
      setCommand("");
      requestAnimationFrame(() => {
        logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
      });
    }
  };

  return (
    <div className="rcon">
      <div className="rcon-quick">
        {QUICK.map((q) => (
          <button key={q} type="button" className="chip" disabled={busy} onClick={() => run(q)}>
            {q}
          </button>
        ))}
      </div>

      <div className="rcon-log" ref={logRef}>
        {lines.length === 0 ? (
          <div className="rcon-empty">Commands and their output show up here.</div>
        ) : (
          lines.map((l, i) => (
            <div key={i} className="rcon-entry">
              <div className="rcon-cmd">&gt; {l.cmd}</div>
              <pre className={`rcon-out ${l.error ? "error" : ""}`}>{l.out}</pre>
            </div>
          ))
        )}
      </div>

      <form
        className="rcon-input-row"
        onSubmit={(e) => {
          e.preventDefault();
          run(command);
        }}
      >
        <input
          className="input rcon-input"
          value={command}
          placeholder="Type an RCON command…"
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setCommand(e.target.value)}
        />
        <button className="btn" type="submit" disabled={busy || !command.trim()}>
          {busy ? "Running…" : "Send"}
        </button>
      </form>
    </div>
  );
}
