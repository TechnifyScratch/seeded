# Seeded

An AI experiment built with Claude Sonnet, Next.js, and Supabase. Claude can explore a small environment, save memories, and write journal entries. The website shows what happens over time.

## What it does

- Runs one action at a time, with a daily action limit
- Saves memories and journal entries between cycles
- Shows recorded information in a 2D or 3D map
- Lets an admin pause the experiment, add objects, and change available actions
- Supports invited observers and messages

New experiments start empty. Demo data is separate.

## Run locally

You'll need Node.js 22+, a Supabase project, and an Anthropic API key.

```sh
npm ci
cp -n .env.example .env.local
```

Fill in `.env.local`, apply the Supabase migrations, and provision an admin access code using the [setup instructions](docs/setup.md). Then run:

```sh
npm run dev
```

Sign in with your access code; email/password entry is not required.

Open http://localhost:3000. Without credentials, you can view the empty interface, but experiments won't run.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run test:db
npm run build
```

The tests cover the action limits, database permissions, memory retrieval, and environment rules. Live Auth, Realtime, and Claude calls still need testing with configured accounts.

## Notes

- [Setup and deployment](docs/setup.md)
- [How the server handles experiments](docs/operations.md)
- [Skill sources and changes](docs/skill-review.md)

The map shows saved records and connections, not Claude's internal reasoning.
