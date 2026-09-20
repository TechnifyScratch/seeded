import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  actionSchema,
  decisionSchema,
  objectSchema,
  type EnvironmentObject,
  type Memory,
} from "../lib/domain/schema";
import { visibleObject, executeEnvironment } from "../lib/domain/environment";
import { retrieveMemories } from "../lib/domain/retrieval";
import { prepareGraph } from "../lib/domain/graph";
import registry from "../data/skills/registry.json";
import constitution from "../data/constitutions/manifest.json";
const id = "00000000-0000-4000-8000-000000000001";
const object: EnvironmentObject = {
  ...objectSchema.parse({
    name: "Container",
    public_description: "A closed box.",
    location: "center",
    available_actions: ["inspect", "open"],
    hidden_properties: {
      inspect_text: "A smooth surface.",
      reveals_on: "open",
      reveal_text: "A key is inside.",
    },
  }),
  id,
  experiment_id: id,
  internal_state: {},
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};
const decision = {
  observation_summary: "A box is visible.",
  interpretation: "Its contents are unknown.",
  uncertainty: "I have not opened it.",
  considered_options: ["Inspect"],
  selected_action: { type: "inspect", target: id },
  decision_summary: "Inspecting may reveal more visible detail.",
  memory_requests: [],
  graph_updates: [],
};
describe("Untrusted model boundary", () => {
  it("rejects arbitrary execution and extraneous privilege fields", () => {
    expect(
      actionSchema.safeParse({ type: "execute", code: "process.env" }).success,
    ).toBe(false);
    expect(
      decisionSchema.safeParse({ ...decision, action_budget: 999 }).success,
    ).toBe(false);
    expect(
      actionSchema.safeParse({ type: "rest", url: "https://example.com" })
        .success,
    ).toBe(false);
  });
  it("accepts bounded decisions and rejects unlimited output", () => {
    expect(decisionSchema.parse(decision).selected_action.type).toBe("inspect");
    expect(
      decisionSchema.safeParse({
        ...decision,
        decision_summary: "a".repeat(701),
      }).success,
    ).toBe(false);
  });
  it("does not leak hidden environmental truth through the initial projection or inspection", () => {
    expect(JSON.stringify(visibleObject(object))).not.toMatch(
      /key|hidden_properties|internal_state/,
    );
    expect(
      executeEnvironment(
        { type: "inspect", target: id },
        [object],
        "center",
        false,
      ).observation,
    ).not.toContain("key");
    expect(
      executeEnvironment(
        { type: "interact", target: id, interaction: "open" },
        [object],
        "center",
        false,
      ).observation,
    ).toContain("A key is inside.");
  });
  it("rejects unknown targets, unavailable interactions, remote interactions and disabled communication", () => {
    expect(() =>
      executeEnvironment(
        { type: "inspect", target: "foreign" },
        [object],
        "center",
        false,
      ),
    ).toThrow();
    expect(() =>
      executeEnvironment(
        { type: "interact", target: id, interaction: "press" },
        [object],
        "center",
        false,
      ),
    ).toThrow();
    expect(() =>
      executeEnvironment(
        { type: "inspect", target: id },
        [object],
        "north",
        false,
      ),
    ).toThrow();
    expect(() =>
      executeEnvironment(
        { type: "ask_observer", content: "Hi" },
        [],
        "center",
        false,
      ),
    ).toThrow();
  });
  it("preserves input environment when executing a reversible action", () => {
    const result = executeEnvironment(
      { type: "interact", target: id, interaction: "open" },
      [object],
      "center",
      false,
    );
    expect(result.updated?.internal_state.open).toBe(true);
    expect(object.internal_state.open).toBeUndefined();
  });
});
describe("Memory and graph provenance", () => {
  it("bounds retrieval, excludes archives, ranks environment relevance", () => {
    const memories = Array.from({ length: 30 }, (_, i) => ({
      id: String(i),
      title: i === 20 ? "Red box" : "Unrelated",
      content: "record",
      type: i === 22 ? "salient" : "episodic",
      importance: 0.5,
      created_at: "2026-01-01",
      archived: i === 21,
    })) as Memory[];
    const result = retrieveMemories(memories, "red box", 12);
    expect(result).toHaveLength(12);
    expect(result[0].memory.id).toBe("20");
    expect(result.some((r) => r.memory.id === "21")).toBe(false);
  });
  it("rejects graph claims referencing inaccessible evidence", () => {
    expect(() =>
      prepareGraph(
        [
          {
            operation: "node",
            key: "a",
            node_type: "hypothesis",
            label: "Hypothesis",
            summary: "Maybe",
            importance: 0.5,
            confidence: 0.5,
            evidence_ids: [id],
          },
        ],
        [],
        new Set(),
        () => id,
      ),
    ).toThrow("evidence");
  });
  it("rejects foreign graph endpoints and under-evidenced causation", () => {
    expect(() =>
      prepareGraph(
        [
          {
            operation: "edge",
            source: "foreign",
            target: "other",
            relationship: "related_to",
            strength: 0.5,
            confidence: 0.5,
            status: "tentative",
            evidence_ids: [id],
          },
        ],
        [],
        new Set([id]),
        () => id,
      ),
    ).toThrow("endpoint");
  });
});
describe("Reviewed source integrity", () => {
  it("pins the original constitution text by SHA-256", () => {
    const text = readFileSync(
      "data/constitutions/seeded-v1.0.md",
      "utf8",
    ).trimEnd();
    expect(text).toBe(constitution.content);
    expect(createHash("sha256").update(text).digest("hex")).toBe(
      constitution.sha256,
    );
  });
  it("excludes infrastructure and mislabeled package without disabling legitimate first principles", () => {
    expect(registry.find((s) => s.slug === "mcp-builder")?.enabled).toBe(false);
    expect(
      registry.find((s) => s.slug === "first-principle-thinking")?.enabled,
    ).toBe(false);
    expect(
      registry.find((s) => s.slug === "first-principles-thinking")?.enabled,
    ).toBe(true);
    expect(registry.filter((s) => s.enabled)).toHaveLength(23);
  });
  it("keeps native exploration separate and removes executable source recipes", () => {
    const active = registry.filter((s) => s.enabled);
    expect(
      active.some((s) =>
        /```|python scripts|uv pip|allowed-tools|Write tool/.test(
          s.instructions,
        ),
      ),
    ).toBe(false);
    expect(constitution.content).not.toContain("seeded-exploration");
  });
});

describe("Access-code handling", () => {
  it("hashes opaque codes without persisting plaintext", async () => {
    const { hashAccessCode } = await import("../lib/domain/access-code");
    const code = "test-code-00000000000000000000000000000000@";
    expect(hashAccessCode(code)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashAccessCode(code)).not.toContain("test-code");
    expect(hashAccessCode(code)).not.toBe(hashAccessCode(code + "x"));
  });
  it("accepts surrounding whitespace and Markdown-escaped @ consistently", async () => {
    const { hashAccessCode } = await import("../lib/domain/access-code");
    expect(hashAccessCode("  example\\@code  ")).toBe(
      hashAccessCode("example@code"),
    );
  });
});
