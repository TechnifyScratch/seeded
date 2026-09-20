import "server-only";
import type { Experiment, Snapshot } from "@/lib/domain/schema";
import { db, unwrap } from "./db";
import { requireUser, requireAccess } from "./auth";
export const emptySnapshot: Snapshot = {
  configured: false,
  role: "observer",
  email: "",
  experiments: [],
  experiment: null,
  memories: [],
  graph_nodes: [],
  graph_edges: [],
  observations: [],
  actions: [],
  decision_records: [],
  journal_entries: [],
  messages: [],
  experiment_logs: [],
  skills: [],
  skill_usage: [],
  capabilities: [],
  cycles: [],
  memory_retrievals: [],
  environment_objects: [],
  constitutions: [],
};
export async function getSnapshot(id?: string): Promise<Snapshot> {
  const user = await requireUser();
  const client = db();
  let allowed: string[] | null = null;
  if (user.role !== "admin")
    allowed = (
      unwrap(
        await client
          .from("experiment_members")
          .select("experiment_id")
          .eq("profile_id", user.id),
      ) ?? []
    ).map((m) => m.experiment_id);
  let expQuery = client
    .from("experiments")
    .select(
      "id,name,status,day,action_budget,actions_used,skill_selections,skill_costs_action,constitution_id,model,is_demo,location,active_skill_id,created_at,updated_at,last_error",
    )
    .order("created_at", { ascending: false });
  if (allowed) expQuery = expQuery.in("id", allowed);
  const experiments = unwrap(await expQuery) as Experiment[];
  const experiment =
    experiments.find((e) => e.id === id) ?? experiments[0] ?? null;
  const out = {
    ...emptySnapshot,
    configured: true,
    role: user.role,
    email: user.email,
    experiments,
    experiment,
  };
  out.constitutions =
    unwrap(
      await client
        .from("constitutions")
        .select("id,name,version,sha256,active,created_at"),
    ) ?? [];
  out.skills =
    unwrap(
      await client
        .from("skills")
        .select(
          "id,slug,name,description,when_useful,source,enabled,category,created_at",
        )
        .order("name"),
    ) ?? [];
  if (!experiment) return out;
  await requireAccess(experiment.id);
  const tables = [
    "memories",
    "graph_nodes",
    "graph_edges",
    "observations",
    "actions",
    "decision_records",
    "journal_entries",
    "messages",
    "experiment_logs",
    "skill_usage",
    "capabilities",
    "cycles",
    "memory_retrievals",
  ] as const;
  const results = await Promise.all(
    tables.map((table) =>
      client
        .from(table)
        .select(
          table === "cycles"
            ? "id,experiment_id,day,action_number,phase,status,error,created_at,completed_at"
            : "*",
        )
        .eq("experiment_id", experiment.id)
        .order("created_at", { ascending: false })
        .limit(table.startsWith("graph_") ? 1000 : 100),
    ),
  );
  for (let i = 0; i < tables.length; i++)
    Object.assign(out, { [tables[i]]: unwrap(results[i]) ?? [] });
  out.environment_objects =
    unwrap(
      await client
        .from("environment_objects")
        .select(
          "id,experiment_id,name,public_description,location,available_actions,created_at,updated_at",
        )
        .eq("experiment_id", experiment.id)
        .order("created_at"),
    ) ?? [];
  return out;
}
