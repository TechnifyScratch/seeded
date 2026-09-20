"use client";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html, Line } from "@react-three/drei";
import { useMemo, useState, Component } from "react";
import type { GraphNode, GraphEdge } from "@/lib/domain/schema";
import { forceLayout } from "@/lib/domain/layout";
const colors: Record<string, string> = {
  object: "#b9cce4",
  observation: "#92aaa3",
  memory: "#bdad91",
  concept: "#aeb8ca",
  hypothesis: "#b6abc7",
  question: "#b6abc7",
  discovery: "#91b6ac",
  skill: "#849ebf",
  action: "#8799aa",
  self_model: "#c1b7a6",
};
class CanvasBoundary extends Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="canvas-empty">
        <h3>3D rendering unavailable</h3>
        <p>
          Use a browser with WebGL enabled. All records remain available in the
          node list.
        </p>
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function Network({
  nodes,
  edges,
  flat,
  selected,
  onSelect,
  reset,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  flat: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
  reset: number;
}) {
  const positions = useMemo(
    () => forceLayout(nodes, edges, flat),
    [nodes, edges, flat],
  );
  const [hover, setHover] = useState<string | null>(null);
  const extent =
    Math.max(12, ...[...positions.values()].map((p) => Math.hypot(...p))) * 2.2;
  if (!nodes.length)
    return (
      <div className="canvas-empty">
        <div className="empty-network-icon">
          <span />
          <span />
          <span />
        </div>
        <h3>No nodes yet</h3>
        <p>Recorded nodes will appear here.</p>
      </div>
    );
  return (
    <CanvasBoundary>
      <Canvas
        key={`${flat}-${reset}`}
        frameloop="demand"
        camera={{
          position: [0, 0, extent],
          fov: 50,
          zoom: flat ? 600 / extent : 1,
          near: 0.1,
          far: 10000,
        }}
        orthographic={flat}
        onPointerMissed={() => setHover(null)}
        dpr={[1, 1.5]}
      >
        <color attach="background" args={["#161e2b"]} />
        <ambientLight intensity={1.8} />
        <directionalLight position={[10, 10, 20]} intensity={1} />
        <OrbitControls
          makeDefault
          enableRotate={!flat}
          minDistance={2}
          maxDistance={2000}
          zoomSpeed={0.8}
        />
        {edges.map((e) => {
          const a = positions.get(e.source_node_id),
            b = positions.get(e.target_node_id);
          return a && b ? (
            <Line
              key={e.id}
              points={[a, b]}
              color={e.status === "contradicted" ? "#a67575" : "#73849a"}
              transparent
              opacity={0.15 + e.confidence * 0.55}
              lineWidth={e.status === "confirmed" ? 1.4 : 1}
              dashed={e.status === "tentative"}
              dashSize={0.35}
              gapSize={0.2}
            />
          ) : null;
        })}
        {nodes.map((n) => (
          <group key={n.id} position={positions.get(n.id)}>
            <mesh
              onClick={(e) => {
                e.stopPropagation();
                onSelect(n.id);
              }}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHover(n.id);
                document.body.style.cursor = "pointer";
              }}
              onPointerOut={() => {
                setHover(null);
                document.body.style.cursor = "auto";
              }}
            >
              <sphereGeometry args={[0.16 + n.importance * 0.22, 20, 16]} />
              <meshStandardMaterial
                color={
                  selected === n.id
                    ? "#77a3f9"
                    : colors[n.node_type] || "#aabaca"
                }
                roughness={0.8}
              />
            </mesh>
            {(nodes.length <= 35 || hover === n.id || selected === n.id) && (
              <Html
                position={[0, 0.6, 0]}
                center
                style={{ pointerEvents: "none" }}
              >
                <div
                  className={`node-label ${selected === n.id ? "selected" : ""}`}
                >
                  {n.label}
                </div>
              </Html>
            )}
          </group>
        ))}
      </Canvas>
    </CanvasBoundary>
  );
}
