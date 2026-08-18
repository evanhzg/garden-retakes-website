"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";

/**
 * The /clip queue as something you can act on.
 *
 * Four things the old modal could not show, all of which it had or could have
 * had: the round (now stamped by the plugin at the moment /clip is typed), the
 * map, the duration (it was already being returned and simply not rendered),
 * and what the mark actually became once it was cut.
 *
 * Four things you can now do: rename the clip a mark produced, retry one the
 * pipeline gave up on, cancel one that has not been cut yet, and delete a mark
 * outright. Deleting a mark leaves its published clip alone — tidying a queue
 * and retracting a video are different acts with very different undo costs, and
 * one button should not do both.
 */

type ClipRequest = {
  id: number;
  map: string;
  round: number | null;
  sessionId: string;
  durationSec: number;
  status: string;
  note: string | null;
  clipId: number | null;
  clipTitle: string | null;
  clipDurationSec: number | null;
  clipUnlisted: boolean;
  playerName: string;
  steamId: string;
  mine: boolean;
  createdAt: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Waiting",
  processing: "Cutting",
  done: "Ready",
  failed: "Failed",
  cancelled: "Cancelled",
};

/** Statuses in the order they mean something, so the filter row reads as a pipeline. */
const STATUS_ORDER = ["pending", "processing", "done", "failed", "cancelled"];

const seconds = (n: number | null | undefined) =>
  typeof n === "number" && n > 0 ? `${n}s` : "—";

export default function ClipsClient({ canSeeAll }: { canSeeAll: boolean }) {
  const [rows, setRows] = useState<ClipRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [map, setMap] = useState<string>("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/feed/clip-requests${showAll ? "?all=1" : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "could not load");
      setRows(data.requests ?? []);
      // A row that is gone should not stay selected and quietly widen the next
      // bulk action to something the user did not tick.
      setSelected((prev) => {
        const live = new Set((data.requests ?? []).map((r: ClipRequest) => r.id));
        return new Set(Array.from(prev).filter((id) => live.has(id)));
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not load");
    } finally {
      setLoading(false);
    }
  }, [showAll]);

  useEffect(() => {
    void load();
  }, [load]);

  const maps = useMemo(
    () => Array.from(new Set(rows.map((r) => r.map).filter(Boolean))).sort(),
    [rows],
  );

  const counts = useMemo(() => {
    const tally = new Map<string, number>();
    for (const r of rows) tally.set(r.status, (tally.get(r.status) ?? 0) + 1);
    return tally;
  }, [rows]);

  const shown = useMemo(
    () =>
      rows.filter(
        (r) => (!status || r.status === status) && (!map || r.map === map),
      ),
    [rows, status, map],
  );

  const actionable = useMemo(
    () => shown.filter((r) => r.mine || canSeeAll),
    [shown, canSeeAll],
  );

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const allShownSelected =
    actionable.length > 0 && actionable.every((r) => selected.has(r.id));

  async function act(ids: number[], what: "retry" | "cancel" | "delete") {
    if (ids.length === 0 || busy) return;
    if (what === "delete" && !confirm(`Delete ${ids.length} mark${ids.length > 1 ? "s" : ""}? The published clip, if there is one, is kept.`)) {
      return;
    }

    setBusy(true);
    setError(null);
    const failures: string[] = [];

    // One at a time rather than in parallel: this is a handful of rows at most,
    // and a burst of writes against a shared database to save a few hundred
    // milliseconds is not a trade worth making.
    for (const id of ids) {
      try {
        const res =
          what === "delete"
            ? await fetch(`/api/feed/clip-requests/${id}`, { method: "DELETE" })
            : await fetch(`/api/feed/clip-requests/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: what === "retry" ? "pending" : "cancelled" }),
              });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          failures.push(`#${id}: ${data.error ?? res.status}`);
        }
      } catch {
        failures.push(`#${id}: network`);
      }
    }

    setBusy(false);
    // Named rather than counted. "3 failed" tells you something went wrong;
    // "#12: cannot go from done to cancelled" tells you what to do about it.
    if (failures.length) setError(failures.join(" · "));
    await load();
  }

  async function rename(row: ClipRequest) {
    if (!row.clipId) return;
    const next = prompt("Name this clip", row.clipTitle ?? "")?.trim();
    if (!next || next === row.clipTitle) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/feed/clips/${row.clipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Naming a clip is also what takes it out of the unlisted state it
        // arrives in — a machine-written title is exactly what "unlisted" is
        // waiting on, so doing both in one step matches what the flag means.
        body: JSON.stringify({ title: next.slice(0, 140), unlisted: false }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "could not rename");
      }
    } catch {
      setError("could not rename");
    } finally {
      setBusy(false);
      await load();
    }
  }

  return (
    <section className="panel clips-page">
      <header className="clips-head">
        <div>
          <h2>Clips</h2>
          <p className="muted">
            Everything you marked with <code>/clip</code> in game, and what became of it.
          </p>
        </div>
        {canSeeAll && (
          <label className="clips-allbox">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
            />
            Everyone&rsquo;s
          </label>
        )}
      </header>

      <div className="clips-filters">
        <div className="clips-chips">
          <button
            className={`chip ${status === "" ? "active" : ""}`}
            onClick={() => setStatus("")}
          >
            All <span className="clips-chip-n">{rows.length}</span>
          </button>
          {STATUS_ORDER.filter((s) => counts.get(s)).map((s) => (
            <button
              key={s}
              className={`chip ${status === s ? "active" : ""}`}
              onClick={() => setStatus(status === s ? "" : s)}
            >
              {STATUS_LABEL[s] ?? s} <span className="clips-chip-n">{counts.get(s)}</span>
            </button>
          ))}
        </div>

        {maps.length > 1 && (
          <select value={map} onChange={(e) => setMap(e.target.value)} className="clips-select">
            <option value="">Every map</option>
            {maps.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}
      </div>

      {selected.size > 0 && (
        <div className="clips-bulk">
          <span>{selected.size} selected</span>
          <button className="btn btn-secondary" disabled={busy} onClick={() => act(Array.from(selected), "retry")}>
            Retry
          </button>
          <button className="btn btn-secondary" disabled={busy} onClick={() => act(Array.from(selected), "cancel")}>
            Cancel
          </button>
          <button className="btn btn-danger" disabled={busy} onClick={() => act(Array.from(selected), "delete")}>
            Delete
          </button>
          <button className="btn btn-ghost" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      {error && <p className="clips-error">{error}</p>}

      {loading ? (
        <p className="muted clips-empty">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="muted clips-empty">
          {rows.length === 0
            ? "Nothing here yet. Type /clip in game after something worth keeping and it will show up."
            : "Nothing matches those filters."}
        </p>
      ) : (
        <div className="clips-tablewrap">
          <table className="clips-table">
            <thead>
              <tr>
                <th className="clips-tick">
                  <input
                    type="checkbox"
                    checked={allShownSelected}
                    onChange={() =>
                      setSelected(allShownSelected ? new Set() : new Set(actionable.map((r) => r.id)))
                    }
                    aria-label="Select all shown"
                    disabled={actionable.length === 0}
                  />
                </th>
                <th>Map</th>
                <th>Round</th>
                <th>Asked for</th>
                <th>Clip</th>
                <th>Status</th>
                <th>When</th>
                {showAll && <th>Who</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className={selected.has(r.id) ? "on" : ""}>
                  <td className="clips-tick">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      disabled={!r.mine && !canSeeAll}
                      aria-label={`Select clip ${r.id}`}
                    />
                  </td>
                  <td className="clips-map">{r.map || "—"}</td>
                  {/* A round of null is a mark made before the plugin stamped
                      one, or one made outside a live round. Neither is round 0. */}
                  <td className="clips-round">{r.round ?? <span className="muted">—</span>}</td>
                  <td>{seconds(r.durationSec)}</td>
                  <td className="clips-title">
                    {r.clipId ? (
                      <>
                        <a href={`/feed?clip=${r.clipId}`}>{r.clipTitle || `Clip #${r.clipId}`}</a>
                        {r.clipDurationSec ? (
                          <span className="muted"> · {seconds(r.clipDurationSec)}</span>
                        ) : null}
                        {r.clipUnlisted && <span className="clips-flag">unlisted</span>}
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <span className={`clips-status is-${r.status}`}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                    {r.note && (
                      <div className="clips-note" title={r.note}>
                        {r.note}
                      </div>
                    )}
                  </td>
                  <td className="muted clips-when">
                    {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                  </td>
                  {showAll && <td className="muted">{r.playerName || r.steamId}</td>}
                  <td className="clips-actions">
                    {(r.mine || canSeeAll) && (
                      <>
                        {r.clipId && (
                          <button className="btn btn-ghost" disabled={busy} onClick={() => rename(r)}>
                            Rename
                          </button>
                        )}
                        {r.status === "failed" && (
                          <button className="btn btn-ghost" disabled={busy} onClick={() => act([r.id], "retry")}>
                            Retry
                          </button>
                        )}
                        {(r.status === "pending" || r.status === "failed") && (
                          <button className="btn btn-ghost" disabled={busy} onClick={() => act([r.id], "cancel")}>
                            Cancel
                          </button>
                        )}
                        <button className="btn btn-ghost danger" disabled={busy} onClick={() => act([r.id], "delete")}>
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
