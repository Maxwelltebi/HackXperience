# HackXperience

CIReN's hackathon platform: applications, check-in, teams, submissions, judging and results, on the web and Android. Lives at hack.ciren.network.

- `docs/BUILD_PLAN.md`: what gets built, phase by phase
- `docs/PROGRESS.md`: what has been built so far, how to run it, open questions
- `AGENTS.md`: rules for every coding agent working here

## Quick start

```bash
corepack enable
pnpm install
pnpm db:start && pnpm db:reset      # local Supabase (needs Docker); or `pnpm db:local` without Docker
pnpm lint && pnpm typecheck && pnpm test
pnpm dev                            # web app on http://localhost:3000
pnpm --filter @hx/mobile start      # Android app (Expo)
```

Environment variables: see `.env.example`.

## Layout

```text
apps/web          Next.js: pages and /api/v1
apps/mobile       Expo Router (Android)
packages/shared   Zod schemas, error codes, constants (web + mobile)
packages/core     pure domain logic
packages/db       SQL access (postgres.js), tx and audit helpers
packages/emails   email templates
supabase/         migrations (source of truth for the schema) and seed
scripts/          restore, local database
```
