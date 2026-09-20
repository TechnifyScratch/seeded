# Setup and implementation

Seeded is an AI experiment built with Claude Sonnet, Next.js, and Supabase. Claude can interact with a small environment, save memories, and write journal entries. The website shows what it does over time.

The information map displays stored records and relationships. It does not represent a brain, sentience, neural activity, or hidden chain-of-thought. Decision records are concise explicit model outputs. Real experiments start with **zero memories and zero graph nodes**. No synthetic records are installed into real experiments.

## Quick start

Requirements: Node.js 22+, npm, a Supabase project (or Supabase CLI + Docker), an Anthropic API key with Claude Sonnet access.

```sh
npm ci
# For a fresh checkout only; preserve an existing .env.local.
cp -n .env.example .env.local
# Fill in .env.local using the instructions below.
npm run dev
```

Open http://localhost:3000. Without credentials, the app displays its empty setup workspace; no model calls or fake activity occur. With Supabase configured, all experimental pages require an invited authenticated profile.

### Environment variables

| Variable | Where used |
| --- | --- |
| `ANTHROPIC_API_KEY` | Server only; Anthropic Messages API |
| `NEXT_PUBLIC_SUPABASE_URL` | Public Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public client key; protected by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Server/administrative CLI only |
| `ANTHROPIC_MODEL` | Sonnet model ID, pinned when an experiment is created; default `claude-sonnet-4-5-20250929` |
| `CRON_SECRET` | Random secret of at least 32 characters; worker authorization |
| `NEXT_PUBLIC_APP_URL` | Exact application origin, e.g. `https://seeded.example.com`; POST origin validation |

Never prefix private keys with `NEXT_PUBLIC_`. Do not commit `.env.local`. Changing the model environment variable affects new experiments only. Use a Sonnet model ID enabled for your Anthropic account.

## Supabase setup

### New hosted project: one SQL file

Open your Supabase project's **SQL Editor**, create a new query, paste the entire contents of [`supabase/setup.sql`](../supabase/setup.sql), and run it as `postgres`. Run this once on a fresh project. It installs all six current migrations in one transaction, including the constitution, skill library, security policies, Realtime publication entries, engine functions, and access-code tables. It does not create demo data or an Auth user.

After it succeeds, configure the environment variables and Auth settings below, then run the **Provision an access code** command. Create your first experiment in the app's Settings after signing in.

Do not also apply migrations 001–006 to this project. If you later switch to the Supabase CLI, link the project and record the already installed versions before pushing newer migrations:

```sh
supabase migration repair --status applied 202609180001 202609180002 202609180003 202609180004 202609180005 202609180006
supabase db push
```

### Alternative: Supabase CLI

Instead of the single SQL file, install the official Supabase CLI and run:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

For local Supabase:

```sh
supabase start
supabase db reset
```

Use the URL and anon/service keys reported by the CLI. Local development uses the checked-in `supabase/config.toml`, which disables public signup. **For hosted Supabase, also disable “Allow new users to sign up” in Authentication settings.** The application has no signup UI or account-creation endpoint, and accounts without an explicit `profiles` record cannot enter the workspace even if the provider is accidentally left open.

Migrations create all tables, constraints, indexes, immutable record triggers, membership RLS, service-only transactional RPCs, the exact constitution, and the reviewed skill registry. They also add only observer-safe tables to `supabase_realtime`. Do not publish `environment_objects`: it contains hidden truth. Keep the default Supabase `public` schema grants; the migration explicitly revokes browser mutation privileges and detailed skill-column reads.

Set the Auth Site URL to your app origin and allow `/auth/callback` for that origin. The application uses access-code sign-in; no public signup is offered.

### Two codes configured in Vercel

Set `SEEDED_ACCESS_CODE_1` and `SEEDED_ACCESS_CODE_2` in Vercel's environment variables, then redeploy. Choose two different codes, each 16–256 characters (long random codes are recommended). Keep these server-only; do not use a `NEXT_PUBLIC_` prefix. The Supabase URL, anon key, and service-role key are still required.

Each code creates an **administrator** on its first use. The login screen first validates the code, then asks for first and last name. The name is saved in Supabase and appears in the workspace. Later logins go straight to the same identity; supplying a different name cannot overwrite it. Anyone with that code signs in as that person.

Each environment variable slot stays associated with its person. Replacing a code rotates the credential while retaining the name and identity. Removing the variable disables that login path; existing sessions remain active until revoked in Supabase. Codes entered through this flow are not stored in the database.

For a new database, run the updated `supabase/setup.sql`. If you already ran the earlier setup, run **only** `supabase/migrations/202609180006_named_access.sql`. No manual account provisioning is needed for these two codes. The CLI method below remains available for additional accounts.

### Provision an access code

Sign-in uses one access-code field. No email or password is requested from the person signing in. Behind the scenes, every code maps to a distinct Supabase Auth identity and an admin/observer profile, preserving session security and RLS.

Your supplied administrator code has a local SHA-256 value in the ignored `.env.local` file. After adding the Supabase keys and applying migrations (including migration 005), provision it:

```sh
npm run access:create -- admin "Research administrator"
```

For a fresh checkout or a different observer code, supply a long random code using an environment variable rather than placing it in shell history:

```sh
read -s SEEDED_ACCESS_CODE
export SEEDED_ACCESS_CODE
npm run access:create -- observer "Research observer"
unset SEEDED_ACCESS_CODE
```

The script accepts either `SEEDED_ACCESS_CODE` (32+ characters) or `SEEDED_ACCESS_CODE_SHA256` (a precomputed hash). These are provisioning-only variables, not public or browser variables. The raw code is never stored in the database, response, or logs. Escaped Markdown `\@` is accepted as `@` when hashing a pasted code.

Open `/login` and paste the code. The server checks its hash, enabled status, and optional expiry, generates and redeems a one-time Supabase token without sending email, and sets the normal session cookies. Login attempts are rate limited in PostgreSQL (10/minute per address bucket, 100/minute globally), so serverless restarts do not reset the limits. Public signup remains disabled.

The printed profile UUID can be granted experiment membership in Settings. Administrators see all experiments; observers see only assigned experiments. A shared code represents a shared identity: issue separate codes if people need different roles or attribution. To revoke future logins, disable its `access_codes` record through trusted Supabase administration; separately revoke that identity's existing Auth sessions if immediate sign-out is needed.

## Constitution

`data/constitutions/seeded-v1.0.md` preserves the supplied constitution verbatim, excluding the message's surrounding `---` separators. The canonical content excludes the file's final newline. `manifest.json` stores “Seeded Core Constitution v1.0”, version `1.0`, canonical text, and SHA-256. Migration 004 installs it and PostgreSQL checks its digest.

Constitution records are append-only. Every experiment and every cycle references its pinned version; the model ID is also immutable. The runner verifies the digest before making a model request. A new constitution requires a new version inserted through a reviewed administrative migration, and a new experiment. Neither the model nor an observer message can edit it.

A separate server protocol specifies output validation and data trust boundaries. It does not rewrite the constitution. Skill instructions are never concatenated into the constitution.

## Skill import and review

All **24 supplied packages were inspected**. The repository contains 22 reviewed cognitive adaptations, the separate `seeded-exploration` skill, and two disabled registry records. Full adapted instructions live in `data/skills/registry.json` and server-side `skills.instructions`. Ordinary requests receive names, descriptions, and when-useful summaries only. The single selected skill's instructions become context for the next action.

```sh
npm run skills:import -- /absolute/path/infoahha.zip
```

This validates each nested `SKILL.md` against its reviewed SHA-256. It does not execute source instructions, extract untrusted paths, follow external references, or import unknown/modified content. The migrations already install the reviewed registry. To re-upload the known reviewed registry, export the two Supabase environment variables in your shell and add `--upload`.

Changed or new skill packages fail closed and require manual review, a new cleaned adaptation, a new source hash, and a reviewed migration. See [skill review](skill-review.md) for decisions and provenance. `mcp-builder` is disabled. `first-principle-thinking` is a mislabeled duplicate journal package and disabled; the legitimate `first-principles-thinking` is enabled. Scripts, MCP calls, filesystem operations, prompt/boot injection, and missing-reference requirements have been removed from the adapted content. Original package instructions are evidence for review, not trusted operational instructions.

## Start an experiment

1. Sign in as an administrator and open Settings.
2. Create a real experiment. It begins paused, with empty memory and an empty environment, pinned to the active constitution.
3. Add environment objects if desired. Define their visible description, location, and allowed interactions. Define hidden inspection, reading, interaction, or conditional reveal text separately. Saving an object creates an explicit visible observation and an object node; only that visible description is immediately known.
4. Set the action budget and capabilities. Memory, graph proposals, skills, and communication are independently controlled. Objects and budget can be changed only while paused (budget also during a completed day).
5. Select **Start / resume**. The server runs a cycle after the response; the authenticated scheduler continues the experiment without an open browser.
6. Observe Live, Map, Memory, Journal, Timeline, Messages, and Skills. End day triggers a bounded reflection. After reflection completes, **Start next day** resets the budget and pauses, ready for an explicit resume.

Pause cancels in-flight work. Emergency stop permanently stops that experiment and invalidates the lease. Any model result arriving after a state/configuration change cannot commit. A new experiment can be created instead of resurrecting an emergency-stopped one.

## How the engine works

`POST /api/admin` validates an administrator command. `GET /api/worker` is authorized with `Bearer CRON_SECRET`; `POST /api/step` is an optional authenticated admin-only development trigger. Each invocation performs at most one proposal per experiment; the scheduler claims up to four experiments fairly, ordered by their last update. The browser never owns execution.

1. `claim_cycle` locks the experiment row, checks status and active constitution, and obtains a unique 150-second lease. Only one pending proposal can commit.
2. Read bounded observations, recent public events, permitted object projections, messages when enabled, and skill summaries.
3. Retrieve up to 48 memory candidates from recency, importance, self-model, and indexed full-text queries. A bounded Sonnet semantic reranker selects relevant snippets (beyond word overlap); up to four lexical/recent/salient anchors are retained. At most 12 full memories reach the decision context. Small candidate sets skip the extra model call. Retrieval is recorded with IDs, scores, and reasons. Semantic retrieval adds cost when there are more than 12 candidates.
4. Save the context used for the cycle on the server. Fetch only the selected skill's detailed instructions, if any.
5. Request one `submit_decision` tool call from Sonnet. Extended thinking is not enabled or requested. Only the validated tool result is used; no hidden chain-of-thought is stored.
6. Zod rejects unknown actions, extra properties, malformed IDs, oversized text, and excessive updates. The environment checks target, location, allowed interaction, capability, graph endpoint ownership, and evidence availability.
7. `commit_cycle` re-locks the experiment and verifies the lease/status/budget. It atomically records the decision, action, actual result observation, memories, graph updates, journal/message content, skill outcome, and audit trail. Any failure rolls back the entire action.
8. Realtime publishes committed observer-safe changes; the UI also refreshes every 15 seconds to recover dropped connections.

The backend has no model-accessible shell, arbitrary URL fetch, SQL execution, JavaScript interpreter, credential tool, permission tool, or infrastructure capability. Model proposals cannot modify the constitution, action budget, logs, or configuration.

**Budget rules:** An environment action consumes one slot. Skill selection costs zero by default, optionally one. At most three consecutive selections are allowed before an environment action; this prevents unlimited free selection loops. A selected skill expires after the next non-skill action. When the budget is exhausted, one separate reflection proposal may `reflect` or `rest` with memory/graph requests but cannot interact with the environment. The day then waits for the administrator. A failed provider request pauses the experiment without charging an action. An expired lease pauses for review rather than automatically repeating an uncertain call.

**Environment:** This release implements a deterministic five-location bounded environment and declarative objects with inspect/read/open/close/press/toggle responses. It intentionally offers no arbitrary scripting. Inspect/read reveal only their configured responses; conditional text is revealed only by its configured trigger. Object internal state is server-only. Moving is bounded to the five locations. Comparisons use already observed descriptions rather than revealing hidden properties.

**Graph:** Actual actions and resulting observations get provenance nodes; memory records and model-proposed concepts/hypotheses have explicit sources. Model confidence is an assessment, not independent scientific verification. Causal edges require multiple cited evidence records but still warrant observer review. Tentative/contradicted/historical states remain traceable in the log. Force layout uses recorded edges, not hard-coded topic clusters. The initial graph can be empty. 3D requires WebGL; the accessible node list remains available when rendering fails.

## Demo mode

Only the explicit administrator **Create separate synthetic demo** action creates synthetic records. It creates a different `is_demo` experiment with clearly labeled minimal UI fixtures. The engine refuses demo experiments. No demo seed runs during initialization, migration, login, or deployment.

## Deploy to Vercel

1. Import this repository into Vercel. Use the Next.js preset, Node.js 22, `npm ci`, and `npm run build`.
2. Apply Supabase migrations before serving the deployed application.
3. Add all environment variables in Vercel, set `NEXT_PUBLIC_APP_URL` to the exact production origin, and configure Supabase Auth's Site URL/redirect allowlist. Redeploy after changing public variables.
4. Set a random 32+ character `CRON_SECRET`. `vercel.json` runs `/api/worker` every minute. Vercel automatically supplies the matching bearer header.
5. **A Vercel plan supporting minute-level Cron is required for this schedule.** If your plan does not support it, remove the cron configuration and use an authenticated external scheduler calling the same endpoint every minute. A local browser is not a scheduler. No browser tab needs to remain open.
6. Provision your administrator with the CLI against the production Supabase project, log in, and initialize the experiment.

The worker and start endpoints have a 120-second maximum. Each Anthropic request has a 45-second timeout and no automatic SDK retries; semantic retrieval plus a decision can take up to roughly 90 seconds. Configure your hosting plan accordingly. Up to four experiments are processed concurrently per tick; scale this bounded worker policy deliberately rather than removing budget/lease checks.

Set spend limits in the Anthropic account appropriate to the intended experiment. The daily action budget bounds actions, while provider calls also include optional semantic retrieval and up to three free skill selections per action.

## Validation

```sh
npm run typecheck
npm run lint
npm test
npm run test:db
npm run build
```

Unit tests cover strict output boundaries, hidden-state projections, permitted interactions, retrieval limits, graph provenance, skill cleanup, and constitution integrity. The embedded PostgreSQL integration test executes every migration and exercises transactions, duplicate workers, cancellation, action budgets, reflection, append-only records, demo isolation, RLS, role escalation, and service-only functions. Its SHA-256 shim replaces the `pgcrypto` extension only in the embedded test environment. Production Supabase uses `pgcrypto`.

CI runs these checks on every push and pull request. Live Supabase Realtime/Auth delivery and live Anthropic model responses require actual service credentials; local tests do not claim to validate those external services. Validate them on a staging Supabase project before your first production experiment.

## Repository guide

- `app/` — authenticated workspace routes, login and API handlers
- `components/` — observer interface, controls and interactive Three.js graph
- `lib/domain/` — pure schemas, environment validation, retrieval scoring, graph provenance/layout
- `lib/server/` — secret-bearing clients, authorization, cycle runner, context construction and transactional calls
- `supabase/migrations/` — database, policies, engine RPCs, constitution and skills
- `data/` — canonical constitution and reviewed registry
- `scripts/` — account provisioning, safe skill import, PostgreSQL integration checks
- `docs/` — source review and operational/security details

Journal entries, observations, decisions, actions, constitutions and audit logs are append-only. Memory archiving preserves content. Graph revisions retain before/after changes in the timeline. Service-role access is privileged: keep it out of browsers and restrict it to this server and explicitly trusted administrative tooling.
