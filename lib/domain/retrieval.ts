import type { Memory } from "./schema";
// Rank candidates by word overlap, age, importance, and memory type.
export function retrieveMemories(
  memories: Memory[],
  query: string,
  limit = 12,
) {
  const terms = new Set(query.toLowerCase().match(/[a-z]{3,}/g) ?? []);
  return memories
    .filter((m) => !m.archived)
    .map((m) => {
      const words = new Set(
        `${m.title} ${m.content}`.toLowerCase().match(/[a-z]{3,}/g) ?? [],
      );
      const overlap =
        [...terms].filter((t) => words.has(t)).length / Math.max(1, terms.size);
      const age = Math.max(
        0,
        (Date.now() - Date.parse(m.created_at)) / 86400000,
      );
      const reasons: string[] = [];
      if (overlap > 0) reasons.push("environment relevance");
      if (age < 7) reasons.push("recent");
      if (m.type === "salient") reasons.push("salience");
      if (m.type === "self_model") reasons.push("self-model");
      return {
        memory: m,
        score:
          overlap * 4 +
          m.importance +
          (m.type === "salient" ? 0.5 : 0) +
          (m.type === "self_model" ? 0.4 : 0) +
          1 / (1 + age),
        reasons,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
