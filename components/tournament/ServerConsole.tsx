"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import type { ConsoleLine } from "@/lib/tournament/console";
import "./console.css";

// A live console for one server.
//
// Live in the sense that matters at an event: the scrollback is shared, so the
// organizer typing in the server and the one on the site see the same thing,
// each line attributed to whoever caused it. Two people independently
// discovering the same fact and then disagreeing about it is the failure this
// avoids — and it is the normal failure, because at a real event there are
// always two people trying to fix the same match.
//
// It is not a tail of the server's own log. That would need the server to send
// its console somewhere (logaddress_add pointed at the site), which is a real
// feature and a bigger one; this is the request/response console, honestly.

const QUICK: { label: string; command: string }[] = [
  { label: "status", command: "status" },
  { label: "Match state", command: "css_t_status" },
  { label: "Force ready", command: "css_forceready" },
  { label: "Restart round", command: "mp_restartgame 1" },
  { label: "Pause", command: "mp_pause_match" },
  { label: "Unpause", command: "css_unpause" },
];

export default function ServerConsole({
  /** One of these. matchId is safer: it cannot name a server the match is not on. */
  serverId,
  matchId,
  adminKey,
  /** Shown above the log, so a panel of six consoles is navigable. */
  title,
  subtitle,
}: {
  serverId?: number;
  matchId?: number;
  adminKey?: string;
  title?: string;
  subtitle?: string;
}) {
  const { t } = useI18n();

  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);

  // The highest sequence seen, so the poll asks for what it does not have
  // rather than re-fetching the whole scrollback every two seconds.
  const seen = useRef(0);
  const log = useRef<HTMLDivElement>(null);

  // Command history, the thing that makes a console usable under pressure:
  // arrow-up is how anybody retries the thing they just typed.
  const history = useRef<string[]>([]);
  const historyAt = useRef(-1);

  const query = useCallback(
    (extra: Record<string, string | number | undefined> = {}) => {
      const params = new URLSearchParams();
      if (serverId) params.set("serverId", String(serverId));
      if (matchId) params.set("matchId", String(matchId));
      if (adminKey) params.set("key", adminKey);
      for (const [k, v] of Object.entries(extra)) {
        if (v !== undefined) params.set(k, String(v));
      }
      return params.toString();
    },
    [serverId, matchId, adminKey],
  );

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/console?${query({ since: seen.current })}`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Not authorized.");
        return;
      }

      setError(null);
      setName(data.serverName ?? null);

      if (Array.isArray(data.lines) && data.lines.length > 0) {
        seen.current = data.lines[data.lines.length - 1].seq;
        setLines((prev) => [...prev, ...data.lines].slice(-200));
      }
    } catch {
      // A dropped poll is a stale console, not a broken one; the next one
      // catches up, because `since` means nothing is missed in between.
    }
  }, [query]);

  useEffect(() => {
    poll();
    const timer = setInterval(poll, 2500);
    return () => clearInterval(timer);
  }, [poll]);

  // Pinned to the bottom, but only when already there — yanking somebody back
  // down while they are reading up the scrollback is worse than not following.
  useEffect(() => {
    const el = log.current;
    if (!el) return;

    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (atBottom) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const run = useCallback(
    async (raw: string) => {
      const cmd = raw.trim();
      if (!cmd || busy) return;

      setBusy(true);
      setError(null);

      history.current = [cmd, ...history.current.filter((h) => h !== cmd)].slice(0, 50);
      historyAt.current = -1;

      try {
        const res = await fetch("/api/admin/console", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ command: cmd, serverId, matchId, key: adminKey }),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error ?? "Failed.");
        } else {
          setCommand("");
          // Appended straight away rather than waiting for the poll: the person
          // who pressed enter should see their own line immediately.
          if (data.line) {
            seen.current = Math.max(seen.current, data.line.seq);
            setLines((prev) => [...prev, data.line].slice(-200));
          }
        }
      } catch (err) {
        setError(String(err));
      } finally {
        setBusy(false);
      }
    },
    [busy, serverId, matchId, adminKey],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;

    e.preventDefault();
    const at = historyAt.current + (e.key === "ArrowUp" ? 1 : -1);

    if (at < 0) {
      historyAt.current = -1;
      setCommand("");
      return;
    }

    if (at >= history.current.length) return;

    historyAt.current = at;
    setCommand(history.current[at]);
  };

  return (
    <section className="cns">
      {(title || name) && (
        <header className="cns-head">
          <h4 className="cns-title">{title ?? name}</h4>
          {subtitle && <span className="cns-sub">{subtitle}</span>}
        </header>
      )}

      {error && <p className="cns-error">{error}</p>}

      <div className="cns-quick">
        {QUICK.map((q) => (
          <button
            key={q.command}
            type="button"
            className="cns-chip"
            disabled={busy || error !== null}
            title={q.command}
            onClick={() => run(q.command)}
          >
            {q.label}
          </button>
        ))}
      </div>

      <div className="cns-log" ref={log}>
        {lines.length === 0 ? (
          <p className="cns-empty">{t("console.empty")}</p>
        ) : (
          lines.map((l) => (
            <div key={l.seq} className="cns-entry">
              <div className="cns-cmd">
                <span className="cns-who">{l.who}</span>
                <code>{l.command}</code>
              </div>
              <pre className={`cns-out ${l.ok ? "" : "bad"}`}>{l.output}</pre>
            </div>
          ))
        )}
      </div>

      <form
        className="cns-row"
        onSubmit={(e) => {
          e.preventDefault();
          run(command);
        }}
      >
        <input
          className="input cns-input"
          value={command}
          placeholder={t("console.placeholder")}
          spellCheck={false}
          autoComplete="off"
          disabled={error !== null}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button className="btn btn-primary" type="submit" disabled={busy || !command.trim()}>
          {busy ? t("console.running") : t("console.send")}
        </button>
      </form>
    </section>
  );
}
