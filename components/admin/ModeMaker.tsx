"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2, Save, Sparkles, Link2, X } from "lucide-react";

// Mode Maker — pitch an entirely new game mode.
//
// The node canvas is hand-rolled (pointer events + an SVG edge layer) rather
// than pulled from a flow library: this codebase has no charting or canvas
// dependency and the rest of it animates with framer-motion, so adding one for
// a single admin tab would be the largest dependency in the project for the
// least-used screen. Everything here is pointer maths and absolutely
// positioned divs.

type NodeKind = "phase" | "rule" | "win" | "twist" | "note";

type GraphNode = {
  id: string;
  kind: NodeKind;
  title: string;
  body: string;
  x: number;
  y: number;
};

type GraphEdge = { id: string; from: string; to: string };

type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };

type Proposal = {
  Id: number;
  Slug: string;
  Title: string;
  Summary: string;
  Status: string;
  Config: string | null;
  Graph: string | null;
  UpdatedAt: string;
};

const NODE_KINDS: { id: NodeKind; label: string; tint: string }[] = [
  { id: "phase", label: "Phase", tint: "#6aa9e0" },
  { id: "rule", label: "Rule", tint: "#e0a94a" },
  { id: "win", label: "Win condition", tint: "#6fcf7f" },
  { id: "twist", label: "Twist", tint: "#c084fc" },
  { id: "note", label: "Note", tint: "#94a3b8" },
];

const kindTint = (kind: NodeKind) => NODE_KINDS.find((k) => k.id === kind)?.tint ?? "#94a3b8";

const NODE_W = 190;
const NODE_H = 96;

const uid = () => Math.random().toString(36).slice(2, 9);

const emptyGraph = (): Graph => ({ nodes: [], edges: [] });

function parseGraph(raw: string | null): Graph {
  if (!raw) return emptyGraph();
  try {
    const parsed = JSON.parse(raw);
    return {
      nodes: Array.isArray(parsed?.nodes) ? parsed.nodes : [],
      edges: Array.isArray(parsed?.edges) ? parsed.edges : [],
    };
  } catch {
    return emptyGraph();
  }
}

export default function ModeMaker({ adminKey }: { adminKey?: string }) {
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [graph, setGraph] = useState<Graph>(emptyGraph());
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  /** Which node an edge is being dragged from, if any. */
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const qs = useCallback(
    (extra = "") => `${adminKey ? `key=${encodeURIComponent(adminKey)}&` : ""}${extra}`,
    [adminKey]
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/game-maker/proposals?${qs()}`);
      const json = await res.json();
      setProposals(json.proposals ?? []);
    } catch {
      setProposals([]);
    }
  }, [qs]);

  useEffect(() => { load(); }, [load]);

  const open = (p: Proposal) => {
    setActiveId(p.Id);
    setTitle(p.Title);
    setSummary(p.Summary);
    setGraph(parseGraph(p.Graph));
    setPan({ x: 0, y: 0 });
    setSavedAt(null);
  };

  const create = async () => {
    if (!newTitle.trim()) return;
    const res = await fetch(`/api/admin/game-maker/proposals?${qs()}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim(), graph: emptyGraph() }),
    });
    const json = await res.json();
    if (res.ok) {
      setNewTitle("");
      setProposals((prev) => [json.proposal, ...(prev ?? [])]);
      open(json.proposal);
    }
  };

  const save = async () => {
    if (activeId === null || saving) return;
    setSaving(true);
    try {
      await fetch(`/api/admin/game-maker/proposals?${qs()}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: activeId, title, summary, graph }),
      });
      setSavedAt(new Date().toLocaleTimeString());
      setProposals((prev) => prev?.map((p) => (p.Id === activeId ? { ...p, Title: title, Summary: summary } : p)) ?? prev);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    await fetch(`/api/admin/game-maker/proposals?${qs(`id=${id}`)}`, { method: "DELETE" });
    setProposals((prev) => prev?.filter((p) => p.Id !== id) ?? prev);
    if (activeId === id) { setActiveId(null); setGraph(emptyGraph()); }
  };

  const addNode = (kind: NodeKind) => {
    // Drop new nodes into the middle of what the author is currently looking
    // at, not at the origin they may have panned far away from.
    const rect = canvasRef.current?.getBoundingClientRect();
    const cx = (rect ? rect.width / 2 : 300) - pan.x - NODE_W / 2;
    const cy = (rect ? rect.height / 2 : 200) - pan.y - NODE_H / 2;
    setGraph((g) => ({
      ...g,
      nodes: [...g.nodes, { id: uid(), kind, title: NODE_KINDS.find((k) => k.id === kind)!.label, body: "", x: cx, y: cy }],
    }));
  };

  const moveNode = (id: string, dx: number, dy: number) => {
    setGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n) => (n.id === id ? { ...n, x: n.x + dx, y: n.y + dy } : n)),
    }));
  };

  const patchNode = (id: string, patch: Partial<GraphNode>) => {
    setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));
  };

  const deleteNode = (id: string) => {
    setGraph((g) => ({
      nodes: g.nodes.filter((n) => n.id !== id),
      // An edge to a node that no longer exists would render as a line into
      // nowhere, so they go with it.
      edges: g.edges.filter((e) => e.from !== id && e.to !== id),
    }));
  };

  const clickNode = (id: string) => {
    if (linkFrom === null) return;
    if (linkFrom === id) { setLinkFrom(null); return; }
    setGraph((g) => {
      const exists = g.edges.some((e) => e.from === linkFrom && e.to === id);
      return exists ? g : { ...g, edges: [...g.edges, { id: uid(), from: linkFrom, to: id }] };
    });
    setLinkFrom(null);
  };

  const active = proposals?.find((p) => p.Id === activeId) ?? null;

  return (
    <div className="mm">
      <div className="mm-intro">
        <Sparkles size={18} />
        <div>
          <h3>Mode Maker</h3>
          <p>
            Pitch a game mode. Lay the idea out as connected nodes — phases, rules, win conditions, the twist that
            makes it worth building — so it can be read at a glance instead of argued from a paragraph.
          </p>
        </div>
      </div>

      <div className="mm-split">
        <aside className="mm-list">
          {proposals === null ? (
            <p className="muted">Loading…</p>
          ) : proposals.length === 0 ? (
            <p className="empty-hint">No pitches yet.</p>
          ) : (
            <ul>
              {proposals.map((p) => (
                <li key={p.Id}>
                  <button className={`mm-item ${activeId === p.Id ? "on" : ""}`} onClick={() => open(p)}>
                    <span className="mm-item-title">{p.Title}</span>
                    <span className={`mm-status ${p.Status}`}>{p.Status}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mm-add">
            <input
              className="input"
              placeholder="New mode pitch"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") create(); }}
            />
            <button className="btn btn-primary" disabled={!newTitle.trim()} onClick={create}>
              <Plus size={15} />
            </button>
          </div>
        </aside>

        <section className="mm-main">
          {!active ? (
            <p className="empty-hint">Pick a pitch, or start a new one.</p>
          ) : (
            <>
              <div className="mm-head">
                <input className="input mm-title" value={title} onChange={(e) => setTitle(e.target.value)} />
                <div className="mm-head-actions">
                  {savedAt && <span className="mm-saved">saved {savedAt}</span>}
                  <button className="btn btn-primary" onClick={save} disabled={saving}>
                    <Save size={14} /> {saving ? "Saving…" : "Save"}
                  </button>
                  <button className="btn btn-ghost gm-danger" onClick={() => remove(active.Id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <textarea
                className="input mm-summary"
                placeholder="The pitch in a couple of sentences — what it is, and why it is worth building."
                value={summary}
                maxLength={500}
                onChange={(e) => setSummary(e.target.value)}
              />

              <div className="mm-toolbar">
                {NODE_KINDS.map((k) => (
                  <button key={k.id} className="mm-tool" style={{ ["--tint" as string]: k.tint }} onClick={() => addNode(k.id)}>
                    <Plus size={12} /> {k.label}
                  </button>
                ))}
                <button
                  className={`mm-tool link ${linkFrom ? "arming" : ""}`}
                  onClick={() => setLinkFrom(linkFrom ? null : "__arm")}
                  title="Connect two nodes"
                >
                  {linkFrom ? <X size={12} /> : <Link2 size={12} />}
                  {linkFrom ? "Cancel link" : "Connect"}
                </button>
                {linkFrom === "__arm" && <span className="mm-tip">Click the node the link starts from.</span>}
                {linkFrom && linkFrom !== "__arm" && <span className="mm-tip">Now click the node it points to.</span>}
              </div>

              <Canvas
                ref={canvasRef}
                graph={graph}
                pan={pan}
                setPan={setPan}
                linkFrom={linkFrom}
                onNodeMove={moveNode}
                onNodePatch={patchNode}
                onNodeDelete={deleteNode}
                onNodeClick={(id) => {
                  if (linkFrom === "__arm") { setLinkFrom(id); return; }
                  clickNode(id);
                }}
                onEdgeDelete={(edgeId) => setGraph((g) => ({ ...g, edges: g.edges.filter((e) => e.id !== edgeId) }))}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

type CanvasProps = {
  graph: Graph;
  pan: { x: number; y: number };
  setPan: (p: { x: number; y: number }) => void;
  linkFrom: string | null;
  onNodeMove: (id: string, dx: number, dy: number) => void;
  onNodePatch: (id: string, patch: Partial<GraphNode>) => void;
  onNodeDelete: (id: string) => void;
  onNodeClick: (id: string) => void;
  onEdgeDelete: (edgeId: string) => void;
};

const Canvas = forwardRef<HTMLDivElement, CanvasProps>(function Canvas(
  { graph, pan, setPan, linkFrom, onNodeMove, onNodePatch, onNodeDelete, onNodeClick, onEdgeDelete },
  ref
) {
  {
    const dragging = useRef<{ id: string | null; lastX: number; lastY: number } | null>(null);

    // Pointer events rather than mouse: one code path covers trackpad, mouse
    // and touch, and pointer capture means a fast drag that leaves the node
    // still tracks instead of stranding it mid-move.
    const onPointerDown = (e: React.PointerEvent, id: string | null) => {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      dragging.current = { id, lastX: e.clientX, lastY: e.clientY };
    };

    const onPointerMove = (e: React.PointerEvent) => {
      const d = dragging.current;
      if (!d) return;
      const dx = e.clientX - d.lastX;
      const dy = e.clientY - d.lastY;
      d.lastX = e.clientX;
      d.lastY = e.clientY;
      if (d.id) onNodeMove(d.id, dx, dy);
      else setPan({ x: pan.x + dx, y: pan.y + dy });
    };

    const endDrag = () => { dragging.current = null; };

    return (
      <div
        ref={ref}
        className={`mm-canvas ${linkFrom ? "linking" : ""}`}
        onPointerDown={(e) => { if (e.target === e.currentTarget) onPointerDown(e, null); }}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="mm-canvas-inner" style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}>
          {/* Edges sit under the nodes so a line never covers text. */}
          <svg className="mm-edges" aria-hidden>
            {graph.edges.map((e) => {
              const from = graph.nodes.find((n) => n.id === e.from);
              const to = graph.nodes.find((n) => n.id === e.to);
              if (!from || !to) return null;
              const x1 = from.x + NODE_W / 2;
              const y1 = from.y + NODE_H / 2;
              const x2 = to.x + NODE_W / 2;
              const y2 = to.y + NODE_H / 2;
              // A gentle horizontal-first curve reads as flow direction
              // without needing arrowheads at this size.
              const mx = (x1 + x2) / 2;
              return (
                <g key={e.id} className="mm-edge" onClick={() => onEdgeDelete(e.id)}>
                  <path d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`} />
                  <circle cx={x2} cy={y2} r={4} />
                </g>
              );
            })}
          </svg>

          {graph.nodes.map((n) => (
            <motion.div
              key={n.id}
              className={`mm-node ${linkFrom ? "linkable" : ""}`}
              style={{ left: n.x, top: n.y, width: NODE_W, ["--tint" as string]: kindTint(n.kind) }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, n.id); }}
              onClick={() => onNodeClick(n.id)}
            >
              <div className="mm-node-head">
                <span className="mm-node-kind">{n.kind}</span>
                <button
                  className="mm-node-del"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onNodeDelete(n.id); }}
                >
                  <X size={11} />
                </button>
              </div>
              <input
                className="mm-node-title"
                value={n.title}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => onNodePatch(n.id, { title: e.target.value })}
              />
              <textarea
                className="mm-node-body"
                placeholder="detail…"
                value={n.body}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => onNodePatch(n.id, { body: e.target.value })}
              />
            </motion.div>
          ))}

          {graph.nodes.length === 0 && (
            <p className="mm-canvas-empty">Add a node to start laying the idea out.</p>
          )}
        </div>
      </div>
    );
  }
});
