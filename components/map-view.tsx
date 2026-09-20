"use client";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { GraphNode, GraphEdge } from "@/lib/domain/schema";
import {
  Search,
  RotateCcw,
  SlidersHorizontal,
  Focus,
  ArrowUpRight,
  X,
  Network as NetworkIcon,
} from "lucide-react";
import { nodeTypes, type Snapshot } from "@/lib/domain/schema";
const Network = dynamic(() => import("./network"), {
  ssr: false,
  loading: () => <div className="canvas-empty">Loading</div>,
});
export default function MapView({ data: initial }: { data: Snapshot }) {
  const [olderNodes, setOlderNodes] = useState<GraphNode[]>([]);
  const [olderEdges, setOlderEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(false);
  const [allLoaded, setAllLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const data = useMemo(
    () => ({
      ...initial,
      graph_nodes: [...initial.graph_nodes, ...olderNodes].filter(
        (n, i, a) => a.findIndex((x) => x.id === n.id) === i,
      ),
      graph_edges: [...initial.graph_edges, ...olderEdges].filter(
        (n, i, a) => a.findIndex((x) => x.id === n.id) === i,
      ),
    }),
    [initial, olderNodes, olderEdges],
  );
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [memoryType, setMemoryType] = useState("all");
  const [confidence, setConfidence] = useState(0);
  const [flat, setFlat] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [isolate, setIsolate] = useState(false);
  const [reset, setReset] = useState(0);
  const [filters, setFilters] = useState(false);
  const selectedNode = data.graph_nodes.find((n) => n.id === selected);
  const connections = data.graph_edges.filter(
    (e) => e.source_node_id === selected || e.target_node_id === selected,
  );
  const cluster = useMemo(() => {
    const ids = new Set<string>();
    if (!selected) return ids;
    ids.add(selected);
    let changed = true;
    while (changed) {
      changed = false;
      for (const e of data.graph_edges)
        if (ids.has(e.source_node_id) || ids.has(e.target_node_id)) {
          if (!ids.has(e.source_node_id) || !ids.has(e.target_node_id))
            changed = true;
          ids.add(e.source_node_id);
          ids.add(e.target_node_id);
        }
    }
    return ids;
  }, [data.graph_edges, selected]);
  const nodes = useMemo(
    () =>
      data.graph_nodes.filter(
        (n) =>
          (type === "all" || n.node_type === type) &&
          n.confidence >= confidence &&
          (!isolate || cluster.has(n.id)) &&
          (!query ||
            `${n.label} ${n.summary}`
              .toLowerCase()
              .includes(query.toLowerCase())) &&
          (memoryType === "all" ||
            data.memories.some(
              (m) => m.id === n.reference_id && m.type === memoryType,
            )),
      ),
    [
      data.graph_nodes,
      data.memories,
      type,
      confidence,
      isolate,
      cluster,
      query,
      memoryType,
    ],
  );
  const edges = useMemo(() => {
    const ids = new Set(nodes.map((n) => n.id));
    return data.graph_edges.filter(
      (e) => ids.has(e.source_node_id) && ids.has(e.target_node_id),
    );
  }, [nodes, data.graph_edges]);
  return (
    <section className="map-shell">
      <div className="map-toolbar">
        <div className="search-input">
          <Search size={16} />
          <input
            aria-label="Search graph nodes"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          className={filters ? "active-button" : ""}
          onClick={() => setFilters(!filters)}
        >
          <SlidersHorizontal size={15} /> Filters
        </button>
        <button
          disabled={!selected}
          className={isolate ? "active-button" : ""}
          onClick={() => setIsolate(!isolate)}
        >
          <Focus size={15} /> Isolate cluster
        </button>
        <div className="segmented">
          <button
            className={!flat ? "chosen" : ""}
            onClick={() => setFlat(false)}
          >
            3D
          </button>
          <button
            className={flat ? "chosen" : ""}
            onClick={() => setFlat(true)}
          >
            2D
          </button>
        </div>
        <button
          aria-label="Reset camera"
          title="Reset camera"
          onClick={() => setReset(reset + 1)}
        >
          <RotateCcw size={16} />
        </button>
      </div>
      {filters && (
        <div className="map-filters">
          <label>
            Node type
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="all">All node types</option>
              {nodeTypes.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Memory type
            <select
              value={memoryType}
              onChange={(e) => setMemoryType(e.target.value)}
            >
              <option value="all">All memories</option>
              {["episodic", "knowledge", "salient", "self_model"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Minimum confidence · {Math.round(confidence * 100)}%
            <input
              type="range"
              min="0"
              max="1"
              step=".05"
              value={confidence}
              onChange={(e) => setConfidence(+e.target.value)}
            />
          </label>
          <button
            onClick={() => {
              setType("all");
              setMemoryType("all");
              setConfidence(0);
              setQuery("");
              setIsolate(false);
            }}
          >
            Clear filters
          </button>
        </div>
      )}
      <div className="map-body">
        <div className="network-canvas">
          <div className="canvas-badge">
            <span className="tiny-dot" /> RECORDED INFORMATION{" "}
            <span>{nodes.length} nodes</span>
          </div>
          <Network
            nodes={nodes}
            edges={edges}
            flat={flat}
            selected={selected}
            onSelect={setSelected}
            reset={reset}
          />
          <div className="canvas-foot">
            <span>
              Drag to {flat ? "pan" : "rotate"} · Scroll to zoom · Right-drag to
              pan
            </span>
            <span>Relationships reflect stored assessments</span>
          </div>
        </div>
        <aside className="inspector">
          {selectedNode ? (
            <>
              <div className="inspector-top">
                <span className="eyebrow">NODE DETAILS</span>
                <button
                  aria-label="Close node details"
                  onClick={() => {
                    setSelected(null);
                    setIsolate(false);
                  }}
                >
                  <X size={16} />
                </button>
              </div>
              <span className="type-tag">
                {selectedNode.node_type.replace("_", " ")}
              </span>
              <h2>{selectedNode.label}</h2>
              <p>{selectedNode.summary}</p>
              <dl className="node-meta">
                <dt>First recorded</dt>
                <dd>{new Date(selectedNode.created_at).toLocaleString()}</dd>
                <dt>Last updated</dt>
                <dd>{new Date(selectedNode.updated_at).toLocaleString()}</dd>
                <dt>Confidence</dt>
                <dd>
                  {Math.round(selectedNode.confidence * 100)}% · stored
                  assessment
                </dd>
                <dt>Importance</dt>
                <dd>{Math.round(selectedNode.importance * 100)}%</dd>
              </dl>
              <h4>
                Relationships <span>{connections.length}</span>
              </h4>
              {connections.length ? (
                connections.map((e) => {
                  const other = data.graph_nodes.find(
                    (n) =>
                      n.id ===
                      (e.source_node_id === selected
                        ? e.target_node_id
                        : e.source_node_id),
                  );
                  return (
                    <button
                      key={e.id}
                      className="relationship"
                      onClick={() => setSelected(other?.id ?? null)}
                    >
                      <strong>
                        {other?.label ?? "Node"}
                        <ArrowUpRight size={14} />
                      </strong>
                      <span>
                        {e.relationship.replaceAll("_", " ")} ·{" "}
                        {Math.round(e.confidence * 100)}%
                      </span>
                      <small>{e.status}</small>
                    </button>
                  );
                })
              ) : (
                <p className="muted">No relationships recorded.</p>
              )}
              <h4>Related memories</h4>
              {data.memories
                .filter(
                  (m) =>
                    m.id === selectedNode.reference_id ||
                    selectedNode.evidence_ids.includes(m.id),
                )
                .map((m) => (
                  <p key={m.id}>
                    <strong>{m.title}</strong>
                    <br />
                    {m.content}
                  </p>
                ))}
              <h4>Evidence & timeline</h4>
              {data.observations
                .filter((o) => selectedNode.evidence_ids.includes(o.id))
                .map((o) => (
                  <p key={o.id}>
                    <small>{new Date(o.created_at).toLocaleString()}</small>
                    <br />
                    {String(o.content)}
                  </p>
                ))}
              <p className="muted">
                Full provenance remains in the audit timeline.
              </p>
            </>
          ) : (
            <>
              <div className="inspector-top">
                <span className="eyebrow">MAP OVERVIEW</span>
                <NetworkIcon size={17} />
              </div>
              <h2>Overview</h2>
              <p>Select a node to view details.</p>
              <div className="map-stats">
                <div>
                  <strong>{data.graph_nodes.length}</strong>
                  <span>Nodes loaded</span>
                </div>
                <div>
                  <strong>{data.graph_edges.length}</strong>
                  <span>Relationships</span>
                </div>
              </div>
              <h4>Active hypotheses</h4>
              {data.graph_nodes
                .filter((n) => n.node_type === "hypothesis")
                .slice(0, 5)
                .map((n) => (
                  <button
                    className="relationship"
                    key={n.id}
                    onClick={() => setSelected(n.id)}
                  >
                    {n.label}
                    <small>{Math.round(n.confidence * 100)}% confidence</small>
                  </button>
                ))}
              {!data.graph_nodes.some((n) => n.node_type === "hypothesis") && (
                <p className="muted">No hypotheses recorded yet.</p>
              )}
              <h4>Recent graph changes</h4>
              {data.experiment_logs
                .filter((l) => String(l.event_type).startsWith("graph_"))
                .slice(0, 4)
                .map((l) => (
                  <p key={l.id}>
                    {String(l.summary)}
                    <br />
                    <small>{new Date(l.created_at).toLocaleTimeString()}</small>
                  </p>
                ))}
              <h4>Recent memories</h4>
              {data.memories.slice(0, 3).map((m) => (
                <p key={m.id}>{m.title}</p>
              ))}
              <div className="map-note">
                This map visualizes stored experimental information. It does not
                represent a brain, neural activity, or hidden chain-of-thought.
              </div>
            </>
          )}
          {data.experiment && (
            <button
              className="load-more"
              disabled={loading || allLoaded}
              onClick={async () => {
                setLoading(true);
                setLoadError("");
                try {
                  const responses = await Promise.all([
                    fetch(
                      `/api/records?experiment=${data.experiment!.id}&table=graph_nodes&offset=${data.graph_nodes.length}`,
                    ),
                    fetch(
                      `/api/records?experiment=${data.experiment!.id}&table=graph_edges&offset=${data.graph_edges.length}`,
                    ),
                  ]);
                  if (responses.some((r) => !r.ok))
                    throw new Error("Could not load graph history");
                  const [n, e] = await Promise.all(
                    responses.map((r) => r.json()),
                  );
                  setOlderNodes([...olderNodes, ...n.records]);
                  setOlderEdges([...olderEdges, ...e.records]);
                  setAllLoaded(
                    n.records.length < 100 && e.records.length < 100,
                  );
                } catch (e) {
                  setLoadError(String(e));
                } finally {
                  setLoading(false);
                }
              }}
            >
              {allLoaded
                ? "Entire graph loaded"
                : loading
                  ? "Loading…"
                  : "Load older graph records"}
            </button>
          )}
          {loadError && <p role="alert">{loadError}</p>}
          <details className="node-list">
            <summary>
              Browse all loaded nodes ({data.graph_nodes.length})
            </summary>
            {data.graph_nodes.map((n) => (
              <button key={n.id} onClick={() => setSelected(n.id)}>
                {n.label}
              </button>
            ))}
          </details>
        </aside>
      </div>
    </section>
  );
}
