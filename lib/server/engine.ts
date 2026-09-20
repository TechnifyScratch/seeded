import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { db, rpc, unwrap } from "./db";
import { chooseAction, semanticRetrieve } from "./model";
import {
  executeEnvironment,
  visibleObject,
  baseActions,
} from "@/lib/domain/environment";
import { prepareGraph } from "@/lib/domain/graph";
import type {
  Experiment,
  EnvironmentObject,
  GraphNode,
  Memory,
  Row,
} from "@/lib/domain/schema";
type Claim = {
  experiment: Experiment;
  cycle: { id: string; phase: string; day: number; action_number: number };
  token: string;
};
export async function runCycle(experimentId: string) {
  if (!process.env.ANTHROPIC_API_KEY)
    throw new Error("Anthropic API key is not configured");
  const claim = (await rpc("claim_cycle", {
    p_experiment: experimentId,
  })) as Claim | null;
  if (!claim) return { ran: false };
  const { experiment: e, cycle, token } = claim;
  const start = Date.now();
  try {
    const client = db();
    const results = await Promise.all([
      client
        .from("constitutions")
        .select("*")
        .eq("id", e.constitution_id)
        .single(),
      client
        .from("environment_objects")
        .select("*")
        .eq("experiment_id", e.id)
        .order("created_at")
        .limit(100),
      client
        .from("observations")
        .select("*")
        .eq("experiment_id", e.id)
        .order("created_at", { ascending: false })
        .limit(24),
      client
        .from("experiment_logs")
        .select("id,event_type,summary,created_at")
        .eq("experiment_id", e.id)
        .order("created_at", { ascending: false })
        .limit(16),
      client
        .from("capabilities")
        .select("name,enabled")
        .eq("experiment_id", e.id),
      client
        .from("skills")
        .select("id,slug,name,description,when_useful")
        .eq("enabled", true)
        .order("slug"),
      client
        .from("messages")
        .select("id,sender_type,content,created_at")
        .eq("experiment_id", e.id)
        .order("created_at", { ascending: false })
        .limit(12),
      client
        .from("graph_nodes")
        .select("*")
        .eq("experiment_id", e.id)
        .order("updated_at", { ascending: false })
        .limit(100),
      client
        .from("graph_edges")
        .select("*")
        .eq("experiment_id", e.id)
        .order("updated_at", { ascending: false })
        .limit(150),
    ]);
    const [
      constitution,
      objectsRaw,
      observationsRaw,
      events,
      capRows,
      skills,
      messages,
      nodesRaw,
      edges,
    ] = results.map(unwrap);
    if (
      createHash("sha256").update(constitution.content).digest("hex") !==
      constitution.sha256
    )
      throw new Error("Constitution integrity check failed");
    const capabilities = new Set(
      (capRows as { name: string; enabled: boolean }[])
        .filter((c) => c.enabled)
        .map((c) => c.name),
    );
    const observations = observationsRaw as Row[];
    const objects = objectsRaw as EnvironmentObject[];
    const nodes = nodesRaw as GraphNode[];
    // All exposed objects have an initial observation created transactionally by admin_command.
    const query = observations
      .slice(0, 5)
      .map((o) => o.content)
      .join(" ")
      .slice(0, 2000);
    const candidates = capabilities.has("memory")
      ? ((await rpc("memory_candidates", {
          p_experiment: e.id,
          p_query: query,
        })) as Memory[])
      : [];
    const retrieved = await semanticRetrieve(e.model, candidates, query);
    let activeSkill = null;
    if (e.active_skill_id && capabilities.has("skills"))
      activeSkill = unwrap(
        await client
          .from("skills")
          .select("id,name,instructions")
          .eq("id", e.active_skill_id)
          .eq("enabled", true)
          .maybeSingle(),
      );
    const availableActions =
      cycle.phase === "reflection"
        ? ["reflect", "rest"]
        : [
            ...baseActions,
            ...(capabilities.has("communication") ? ["ask_observer"] : []),
            ...(capabilities.has("skills") && e.skill_selections < 3
              ? ["use_skill"]
              : []),
          ];
    const context = {
      phase: cycle.phase,
      day: e.day,
      action_number: cycle.action_number,
      actions_remaining: e.action_budget - e.actions_used,
      location: e.location,
      observations,
      objects: objects.map(visibleObject),
      memories: retrieved.map((r) => r.memory),
      recent_events: events,
      messages: capabilities.has("communication") ? messages : [],
      available_actions: availableActions,
      action_constraints:
        "Object inspection/read/interaction requires current location. compare uses previously observed public descriptions. move locations: center,north,south,east,west. Interactions require the exact object available_actions value.",
      enabled_capabilities: [...capabilities],
      available_skills: capabilities.has("skills") ? skills : [],
      active_skill: activeSkill,
      graph_nodes: capabilities.has("graph") ? nodes : [],
      graph_edges: capabilities.has("graph") ? edges : [],
      memory_requests_allowed: capabilities.has("memory"),
      graph_updates_allowed: capabilities.has("graph"),
    };
    await rpc("save_context", {
      p_cycle: cycle.id,
      p_token: token,
      p_context: context,
    });
    const { decision } = await chooseAction(
      e.model,
      constitution.content,
      context,
    );
    const action = decision.selected_action;
    if (!availableActions.includes(action.type))
      throw new Error("Model proposed an unavailable action");
    if (decision.memory_requests.length && !capabilities.has("memory"))
      throw new Error("Memory capability unavailable");
    if (decision.graph_updates.length && !capabilities.has("graph"))
      throw new Error("Graph capability unavailable");
    for (const request of decision.memory_requests)
      if (
        request.operation === "archive" &&
        !retrieved.some((r) => r.memory.id === request.memory_id)
      )
        throw new Error("Cannot archive a memory not retrieved");
    let observation: string;
    let location = e.location;
    let objectUpdate = null;
    let skillId: null | string = null;
    if (action.type === "use_skill") {
      const skill = (skills as { id: string; name: string }[]).find(
        (s) => s.id === action.skill,
      );
      if (!skill) throw new Error("Unknown skill");
      if (decision.graph_updates.length || decision.memory_requests.length)
        throw new Error("Skill selection must not contain environment effects");
      skillId = skill.id;
      observation = `Selected skill: ${skill.name}. Detailed instructions are available for the next action.`;
    } else {
      const result = executeEnvironment(
        action,
        objects,
        e.location,
        capabilities.has("communication"),
      );
      observation = result.observation;
      location = result.location;
      objectUpdate = result.updated;
    }
    const evidence = new Set([
      ...observations.map((o) => o.id),
      ...retrieved.map((r) => r.memory.id),
    ]);
    const graph = prepareGraph(
      decision.graph_updates,
      nodes,
      evidence,
      randomUUID,
    );
    await rpc("commit_cycle", {
      p_cycle: cycle.id,
      p_token: token,
      p: {
        decision,
        observation,
        location,
        object_update: objectUpdate
          ? { id: objectUpdate.id, internal_state: objectUpdate.internal_state }
          : null,
        skill_id: skillId,
        ...graph,
        retrievals: retrieved.map((r) => ({
          id: r.memory.id,
          score: r.score,
          reasons: r.reasons,
        })),
        duration_ms: Date.now() - start,
      },
    });
    return { ran: true, cycleId: cycle.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cycle failed";
    // Do not persist provider error bodies; they can contain submitted data or provider diagnostics.
    const safe =
      message.includes("API") ||
      message.includes("401") ||
      message.includes("429")
        ? "Model provider request failed. Check credentials, quota, and server logs."
        : message.slice(0, 350);
    await rpc("fail_cycle", {
      p_cycle: cycle.id,
      p_token: token,
      p_error: safe,
    });
    return { ran: false, error: safe };
  }
}
