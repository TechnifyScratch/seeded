import type { Decision, GraphNode } from "./schema";
export function prepareGraph(
  updates: Decision["graph_updates"],
  known: GraphNode[],
  evidence: Set<string>,
  makeId: () => string,
) {
  const nodes: Array<Partial<GraphNode> & { id: string }> = [];
  const edges: Array<{
    source_node_id: string;
    target_node_id: string;
    relationship: string;
    strength: number;
    confidence: number;
    status: string;
    evidence_ids: string[];
  }> = [];
  const ids = new Map(known.map((n) => [n.id, n.id]));
  for (const u of updates) {
    if (u.evidence_ids.some((id) => !evidence.has(id)))
      throw new Error("Graph evidence was not available in this cycle");
    if (u.operation === "node") {
      if (ids.has(u.key)) throw new Error("Duplicate graph key");
      const existing = known.find(
        (n) =>
          n.node_type === u.node_type &&
          n.label.toLowerCase() === u.label.toLowerCase(),
      );
      const id = existing?.id ?? makeId();
      ids.set(u.key, id);
      nodes.push({
        id,
        node_type: u.node_type,
        label: u.label,
        summary: u.summary,
        importance: u.importance,
        confidence: u.confidence,
        evidence_ids: u.evidence_ids,
        reference_id: existing?.reference_id ?? null,
      });
    }
  }
  for (const u of updates)
    if (u.operation === "edge") {
      const source = ids.get(u.source),
        target = ids.get(u.target);
      if (!source || !target || source === target)
        throw new Error("Graph endpoint unavailable");
      // Confidence is a recorded model assessment, not independent scientific verification.
      if (
        u.relationship === "caused" &&
        (u.status !== "confirmed" || u.evidence_ids.length < 3)
      )
        throw new Error(
          "Causal edge requires at least three evidence records; use possibly_caused",
        );
      edges.push({
        source_node_id: source,
        target_node_id: target,
        relationship: u.relationship,
        strength: u.strength,
        confidence: u.confidence,
        status: u.status,
        evidence_ids: u.evidence_ids,
      });
    }
  return { nodes, edges };
}
