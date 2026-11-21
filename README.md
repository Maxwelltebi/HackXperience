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

## Run it locally and watch it change

`pnpm dev` reloads the page as files change, so you see each change as it's built.

### Mode A: browse, no sign-in (works with no setup)

`apps/web/.env.local` already points at the local database. Use two terminals:

```bash
pnpm db:local    # terminal 1: Postgres on port 54322 with demo data; leave it running
pnpm dev         # terminal 2: http://localhost:3000
```

You can see the home page, `/events` and the demo event _The CIReN Experience 5.0_. Everything behind
sign-in (profile, applying, teams, organizer screens) needs Mode B.

### Mode B: everything, with real sign-in (free Supabase dev project, no Docker)

One-time setup, about 20 minutes:

1. **Create the project.** At [supabase.com](https://supabase.com), create a new project
   `hackxperience-dev` in a European region. Save the database password. 
2. **GitHub sign-in.** At github.com → Settings → Developer settings → OAuth Apps, create an app.
   - Homepage URL: `http://localhost:3000`
   - Callback URL: `https://<project-ref>.supabase.co/auth/v1/callback`

   In Supabase → Authentication → Sign In / Providers, turn on GitHub and paste its Client ID and
   secret.

3. **Redirect URLs.** In Supabase → Authentication → URL Configuration, set the Site URL to
   `http://localhost:3000`, and add `http://localhost:3000/**` to the Redirect URLs. The wildcard
   lets `/auth/callback?next=…` through, so sign-in returns you to the page you started on.
4. **Create the tables** (applies every migration in `supabase/migrations`):
   ```bash
   pnpm exec supabase login
   pnpm exec supabase link --project-ref <project-ref>
   pnpm exec supabase db push --remote   # without --remote it targets the local database
   ```
5. **Point the app at the project.** Edit `apps/web/.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`: the project URL (`https://<project-ref>.supabase.co`)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: the anon or publishable key, from Project Settings → API Keys
   - `DATABASE_URL`: from the **Connect** button → Transaction pooler, with your password filled in
6. **First sign-in.** Run `pnpm dev`, open http://localhost:3000 and sign in with GitHub. Then make
   yourself a CIReN organizer in Supabase → SQL Editor:
   ```sql
   insert into org_members (org_id, user_id)
   select '00000000-0000-4000-8000-00000000c12e', id from users where email = 'you@example.com';
   ```

After that, run `pnpm dev`. When a later phase adds a migration, run `pnpm exec supabase db push --remote`
again.

**Trying every role with one account.** Create an event under Organize and publish it. Then apply to
it yourself, accept yourself under Applications, confirm on the event page, and you have a ticket
and a team. As the owner you can also open Check-in and scan that ticket. The laptop webcam works,
because the camera is allowed on `localhost`.

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
