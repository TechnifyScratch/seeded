import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(
  `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create publication supabase_realtime;create function public.digest(text,text) returns bytea language sql immutable as $$select sha256(convert_to($1,'UTF8'))$$;`,
);
const sqlFiles = process.argv.includes("--setup")
  ? ["supabase/setup.sql"]
  : readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((file) => `supabase/migrations/${file}`);
for (const file of sqlFiles)
  await db.exec(
    readFileSync(file, "utf8").replace(
      "create extension if not exists pgcrypto;",
      "-- Core SHA-256 shim for embedded PostgreSQL; production uses pgcrypto.",
    ),
  );
const admin = "10000000-0000-4000-8000-000000000001",
  observer = "10000000-0000-4000-8000-000000000002",
  outsider = "10000000-0000-4000-8000-000000000003";
await db.query("insert into auth.users values($1),($2),($3)", [
  admin,
  observer,
  outsider,
]);
await db.query(
  "insert into profiles(id,email,role) values($1,'admin@test.local','admin'),($2,'observer@test.local','observer'),($3,'outsider@test.local','observer')",
  [admin, observer, outsider],
);
const namedUser = "10000000-0000-4000-8000-000000000004";
const competingUser = "10000000-0000-4000-8000-000000000005";
await db.query("insert into auth.users values($1),($2)", [
  namedUser,
  competingUser,
]);
const claimSlot = async (id: string, first: string) =>
  (
    await db.query<{ id: string }>(
      "select claim_access_slot(1,$1,'named@seeded.invalid',$2,'Person') id",
      [id, first],
    )
  ).rows[0].id;
assert.equal(await claimSlot(namedUser, "First"), namedUser);
assert.equal(await claimSlot(competingUser, "Replacement"), namedUser);
assert.equal(
  (
    await db.query<{ first_name: string }>(
      "select first_name from profiles where id=$1",
      [namedUser],
    )
  ).rows[0].first_name,
  "First",
);
await db.exec("set role authenticated");
await assert.rejects(
  () => db.query("select * from access_slots"),
  /permission denied/,
);
await assert.rejects(
  () => claimSlot(competingUser, "Replacement"),
  /permission denied/,
);
await db.exec("reset role");
async function command(command: string, e: string | null, data: object = {}) {
  return (
    await db.query<{ id: string }>(
      "select admin_command($1,$2,$3,$4::jsonb) id",
      [admin, command, e, JSON.stringify(data)],
    )
  ).rows[0].id;
}
async function claim(e: string) {
  return (
    await db.query<{ c: { cycle: { id: string }; token: string } | null }>(
      "select claim_cycle($1) c",
      [e],
    )
  ).rows[0].c;
}
function payload(type = "rest") {
  return {
    decision: {
      observation_summary: "No objects observed.",
      interpretation: "The environment is empty.",
      uncertainty: "Nothing to inspect.",
      considered_options: ["rest"],
      selected_action:
        type === "reflect"
          ? { type, content: "No environmental action was taken." }
          : { type },
      decision_summary: "Rest is available.",
      memory_requests: [],
      graph_updates: [],
    },
    observation: "No environment interaction was made.",
    location: "center",
    nodes: [],
    edges: [],
    retrievals: [],
    skill_id: null,
    object_update: null,
  };
}
async function commit(
  c: NonNullable<Awaited<ReturnType<typeof claim>>>,
  p: object,
) {
  await db.query("select commit_cycle($1,$2,$3::jsonb)", [
    c.cycle.id,
    c.token,
    JSON.stringify(p),
  ]);
}
const e = await command("create", null, {
  name: "Real test",
  model: "test-sonnet",
  action_budget: 1,
});
assert.equal(
  (await db.query("select * from memories where experiment_id=$1", [e])).rows
    .length,
  0,
);
assert.equal(
  (await db.query("select * from graph_nodes where experiment_id=$1", [e])).rows
    .length,
  0,
);
await command("resume", e);
const first = await claim(e);
assert.ok(first);
assert.equal(await claim(e), null, "concurrent claim must be blocked");
await command("pause", e);
await assert.rejects(() => commit(first, payload()), /Stale/);
assert.equal(
  (
    await db.query<{ actions_used: number }>(
      "select actions_used from experiments where id=$1",
      [e],
    )
  ).rows[0].actions_used,
  0,
);
await command("resume", e);
const active = await claim(e);
assert.ok(active);
const broken = {
  ...payload(),
  nodes: [
    {
      id: crypto.randomUUID(),
      node_type: "invalid",
      label: "Invalid",
      summary: "bad",
      importance: 1,
      confidence: 1,
      evidence_ids: [],
    },
  ],
};
await assert.rejects(() => commit(active, broken));
assert.equal(
  (await db.query("select * from actions where experiment_id=$1", [e])).rows
    .length,
  0,
  "failed transaction must roll back action and decision",
);
await commit(active, payload());
await commit(active, payload());
assert.equal(
  (await db.query("select * from actions where experiment_id=$1", [e])).rows
    .length,
  1,
  "duplicate commit must be idempotent",
);
const ex = (
  await db.query<{ actions_used: number; status: string }>(
    "select actions_used,status from experiments where id=$1",
    [e],
  )
).rows[0];
assert.equal(ex.actions_used, 1);
assert.equal(ex.status, "reflecting");
const reflection = await claim(e);
assert.ok(reflection);
await assert.rejects(
  () => commit(reflection, payload("inspect")),
  /Reflection/,
);
await commit(reflection, payload("reflect"));
assert.equal(await claim(e), null);
assert.equal(
  (
    await db.query<{ status: string }>(
      "select status from experiments where id=$1",
      [e],
    )
  ).rows[0].status,
  "day_complete",
);
await command("next_day", e);
assert.equal(
  (
    await db.query<{ day: number }>("select day from experiments where id=$1", [
      e,
    ])
  ).rows[0].day,
  2,
);
await assert.rejects(
  () =>
    db.query(
      "update experiment_logs set summary='tampered' where experiment_id=$1",
      [e],
    ),
  /append-only/,
);
await assert.rejects(
  () => db.query("update constitutions set content='tampered'"),
  /append-only/,
);
await assert.rejects(
  () => db.query("update journal_entries set content='tampered'"),
  /append-only/,
);
await command("resume", e);
const stopped = await claim(e);
assert.ok(stopped);
await command("stop", e);
await assert.rejects(() => commit(stopped, payload()), /Stale/);
await assert.rejects(() => command("resume", e), /cannot resume/);
const demo = await command("demo", null, {
  name: "Demo",
  model: "test",
  action_budget: 20,
});
assert.equal(await claim(demo), null);
await assert.rejects(() => command("resume", demo), /cannot resume/);
await command("member", e, { profile_id: observer });
// Simulate Supabase table grants and JWT auth. The migration denies all browser writes.
await db.exec(
  "grant usage on schema public,auth to authenticated;grant select on all tables in schema public to authenticated;revoke select on skills from authenticated;grant select(id,slug,name,description,when_useful,source,source_sha256,enabled,category,created_at,updated_at) on skills to authenticated;",
);
await db.query(
  "insert into access_codes(profile_id,code_hash,label) values($1,$2,'Test code')",
  [admin, "a".repeat(64)],
);
for (let attempt = 1; attempt <= 11; attempt++)
  assert.equal(
    (
      await db.query<{ ok: boolean }>(
        "select consume_login_attempt('test-bucket',10) ok",
      )
    ).rows[0].ok,
    attempt <= 10,
    "persistent login limit",
  );
await db.exec(
  `set role authenticated;set request.jwt.claim.sub='${observer}';`,
);
assert.equal(
  (await db.query("select * from access_codes")).rows.length,
  0,
  "code hashes remain private even if table read grants change",
);
await assert.rejects(
  () => db.query("select consume_login_attempt('bypass',100)"),
  /permission denied/,
);
assert.equal(
  (await db.query("select * from experiments")).rows.length,
  1,
  "observer only sees membership",
);
assert.equal(
  (await db.query("select * from environment_objects")).rows.length,
  0,
  "hidden environment truth is never readable",
);
await assert.rejects(
  () => db.query("select instructions from skills"),
  /permission denied/,
);
await assert.rejects(
  () => db.query("select claim_cycle($1)", [e]),
  /permission denied/,
);
await assert.rejects(
  () => db.query("update profiles set role='admin' where id=$1", [observer]),
  /permission denied/,
);
await assert.rejects(
  () =>
    db.query(
      "insert into experiment_logs(experiment_id,event_type,summary) values($1,'forged','forged')",
      [e],
    ),
  /permission denied/,
);
await db.exec(`set request.jwt.claim.sub='${outsider}';`);
assert.equal((await db.query("select * from experiments")).rows.length, 0);
assert.equal((await db.query("select * from memories")).rows.length, 0);
await db.exec("reset role");
console.log(
  "PASS: all migrations, clean initialization, leases, pause/stop cancellation, atomic rollback, idempotent commit, budget/reflection, immutable records, demo isolation, RLS membership, hidden truth, skill-column permissions, role escalation and RPC restrictions.",
);
await db.close();
