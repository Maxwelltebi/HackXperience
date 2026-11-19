# Progress

Handoff log between phases. Each phase adds a section: what was built, how to run it, what was left out and why, new dependencies, and questions for a human. Newest phase first. The two registers below stay at the top and are updated every phase.

---

## Open questions register

One list for every open question. Agents add rows; a person answers in the **Answer** column (or in a commit message that names the ID), and the next agent applies the answer and moves the row to Resolved. **Default if unanswered** is what the code does today, so nothing blocks unless the Blocks column says so.

### Open

| ID  | Question                                                                                                                                                                              | Raised | Blocks            | Default if unanswered                  | Answer |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------- | -------------------------------------- | ------ |
| Q1  | **When is the next CIReN event?** It decides the full 8-phase plan or the cut line (Phases 1–5, web only). (DESIGN Step 8)                                                            | Design | Planning          | Full plan, web first                   |        |
| Q2  | **Is school public?** `GET /users/{id}/profile` is public (DESIGN Step 4) and returns name, avatar, bio, GitHub username, school.                                                     | P1     | —                 | School shown                           |        |
| Q3  | **GitHub accounts with no public email.** `users.email` is `not null`, so that sign-in fails. Acceptable (they use Google), or handle it? _(auth)_                                    | P1     | —                 | Sign-in fails with the error page      |        |
| Q4  | **Account deletion.** `audit_log.actor_id` has no cascade, so deleting a user with audit rows fails. Should accounts be deletable, and what happens to their audit rows? _(deletion)_ | P1     | Phase 7           | Accounts can't be deleted              |        |
| Q5  | **`EXPO_PUBLIC_API_URL`** (the web app's URL, for the mobile app) is missing from the build plan's environment table. Add it there?                                                   | P1     | —                 | Documented in `.env.example`           |        |
| Q6  | **Code of conduct.** Where does the sign-in page's "code of conduct" link go?                                                                                                         | P1     | Launch            | Plain text                             |        |
| Q7  | Should drafts with no title and no write-up be judged? (DESIGN Step 8)                                                                                                                | Design | Phase 4           | No (current rule)                      |        |
| Q8  | Real CIReN event sizes, to recheck the DESIGN Step 2 estimates.                                                                                                                       | Design | Phase 7 load test | 500 applicants, 300 accepted, 80 teams |        |

### Resolved

| ID  | Question                                                                                       | Resolution                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Design doc missing                                                                             | Added 19 Nov 2026; copied to `docs/DESIGN.md`.                                                                                                      |
| R2  | Header name `server_time` vs `Server-Time`                                                     | DESIGN Step 4 says `server_time`. Kept.                                                                                                             |
| R3  | Error code names                                                                               | DESIGN only fixes the shape and the domain codes (`TEAM_FULL`, `STALE_VERSION`, …). The generic codes stay.                                         |
| R4  | Should the public profile require sign-in?                                                     | No: DESIGN Step 4 says "anyone". School is still open (Q2).                                                                                         |
| R5  | Error `details` shape                                                                          | DESIGN Step 4 shows `"details": {}`. Changed from an array to an object; validation problems are under `details.fields` as `{ "path": "message" }`. |
| R6  | `DELETE /me/push-tokens` body vs path                                                          | DESIGN Step 4: `DELETE /me/push-tokens/{token}`. Changed.                                                                                           |
| R7  | Retry-safe creates: body `id` (build plan rule 14) vs `Idempotency-Key` header (DESIGN Step 4) | `handler({ clientId: true })` accepts either; if both are sent they must match.                                                                     |

---

## Mobile app status

The Android app is paused while the web app is finished (the web app covers every role on phones; DESIGN Step 8 cut line). This log is what a person or agent needs to pick it back up.

| Area                                                                                                                    | State                                                              | Where                                          | Next step                                                                    |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------------- |
| App shell, Expo SDK 58, Expo Router                                                                                     | Done                                                               | `apps/mobile/src/app/_layout.tsx`              | —                                                                            |
| Package `network.ciren.hackxperience`, scheme `hackxperience`                                                           | Done (the package is fixed after the first Play upload)            | `apps/mobile/app.json`                         | —                                                                            |
| Google and GitHub sign-in (PKCE, in-app browser, deep link)                                                             | Built, **not yet tried on a device** (needs Supabase OAuth set up) | `src/lib/auth.tsx`, `src/lib/auth-redirect.ts` | Phase 1 gate: sign in on Android in development                              |
| Session storage                                                                                                         | AsyncStorage                                                       | `src/lib/supabase.ts`                          | —                                                                            |
| API client: bearer token, error shape, `server_time` offset                                                             | Done                                                               | `src/lib/api.ts` (`serverNow()`)               | Add calls per phase                                                          |
| Profile screen: name, school, GitHub, time zone, email reminders                                                        | Done                                                               | `src/app/index.tsx`                            | Add bio, level, graduation year, country, gender to match the web            |
| Design tokens (colors, raised and inset shadows, 52 px controls)                                                        | Done                                                               | `src/theme.ts`, `src/components/ui.tsx`        | —                                                                            |
| Fonts (Inter, Inter Tight, JetBrains Mono)                                                                              | Not started; system font                                           | —                                              | Load with `expo-font` before the Phase 3 screens                             |
| App icon, splash artwork                                                                                                | Not started                                                        | —                                              | Needed before the first Play upload                                          |
| Unit tests                                                                                                              | 4 (redirect parsing)                                               | `src/lib/auth-redirect.test.ts`                | —                                                                            |
| Bundle check                                                                                                            | `expo export --platform android` passes                            | —                                              | Run before each build                                                        |
| **Phase 3:** events list, event page, ticket QR, my team, volunteer scanner; EAS build profile; first closed-test build | Not started                                                        | —                                              | Start the Play closed test early: 14 days with 12+ testers before production |
| **Phase 5:** judge scoring screen                                                                                       | Not started                                                        | —                                              | —                                                                            |
| **Phase 6:** push token registration, announcements feed, mentor request form, `useLiveChannel`                         | Not started (the token endpoints exist)                            | —                                              | —                                                                            |

Known gaps: the time zone field is free text (validated by the API), not a picker; the mobile profile shows fewer fields than the web.

---

## Phase 1: Foundations (built 18 Nov 2026, gate not yet run)

### Status

| Check                                                   | Result                                                                                  |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Migrations apply cleanly to an empty database           | Passed locally (embedded Postgres 17 with a Supabase stand-in; see below)               |
| `pnpm lint && pnpm typecheck && pnpm test`              | Passed locally: 6 packages, 79 tests (shared 22, db 11, web 42, mobile 4), none skipped |
| `next build`                                            | Passed; no server secrets or the database driver in `.next/static`                      |
| Android JS bundle (`expo export --platform android`)    | Passed                                                                                  |
| CI on GitHub with the real Supabase stack               | **Not run yet.** Needs a push, which is a person's job                                  |
| Deploy to Vercel, OAuth on web and Android, nightly run | **Not run yet.** Needs the human-only setup tasks                                       |

Phase 1 was built before `docs/DESIGN.md` existed, then aligned with it on 19 Nov 2026 (register items R2–R7). Remaining differences from DESIGN, both deliberate:

- **Auth routes.** DESIGN lists `POST /auth/google`, `/auth/github`, `/auth/logout`. Supabase runs the OAuth exchange, so the web app has a sign-in server action, `GET /auth/callback` and `POST /auth/sign-out` instead, and mobile talks to Supabase directly. None of these are under `/api/v1`.
- **`GET /me` roles per event.** DESIGN says `/me` returns roles per event. Events and `event_staff` arrive in Phase 2, which adds them.

### What was built

**Monorepo** (pnpm 12 workspaces, Turborepo, TypeScript 6 strict, ESLint 10 flat config, Prettier, Vitest 5)

- `apps/web`: Next.js 16 App Router. Pages: `/` (landing, from screens PDF pages 2–3, minus the events section), `/sign-in` (PDF page 4), `/profile`. Routes: `/auth/callback`, `/auth/sign-out` (POST only).
- `apps/mobile`: Expo SDK 58 with Expo Router. Screens: sign-in, profile. Package `network.ciren.hackxperience`, scheme `hackxperience`.
- `packages/shared`: error codes and the one error shape (`errors.ts`), `SERVER_TIME_HEADER`, base and identity Zod schemas, time zone validation.
- `packages/db`: postgres.js client (`getSql`, `prepare: false` for the transaction pooler), `tx()`, `audit()`, identity queries, test helpers (`@hx/db/testing`), hand-written `database.types.ts`.
- `packages/core`, `packages/emails`: empty shells for Phases 2+.

**Database:** `supabase/migrations/0001_identity.sql`

- Every enum from the Canonical schema; tables `users`, `profiles`, `organizations`, `org_members`, `push_tokens`, `audit_log`, `rate_limit_counters`, exactly as in the Canonical schema.
- RLS enabled on all seven, no policies. A test asserts both, for every public table.
- CIReN organization seeded with fixed id `00000000-0000-4000-8000-00000000c12e` (`CIREN_ORG_ID` in shared).
- Trigger `on_auth_user_created` → `handle_new_auth_user()` (security definer, empty search_path, execute revoked from clients). It creates one `users` row (lowercased email; name from `full_name`, then `name`, then `user_name`) and one `profiles` row (`avatar_url` from the provider; `github_username` for GitHub sign-ins).
- `supabase/seed.sql`: three local users, one of them a CIReN org member.

**API** (`apps/web/app/api/v1/`, all through `handler()`)

| Endpoint                         | Auth     | Notes                                                                             |
| -------------------------------- | -------- | --------------------------------------------------------------------------------- |
| `GET /health`                    | none     | `select 1`; 503 `SERVICE_UNAVAILABLE` if the database is down                     |
| `GET /me`                        | required | user + profile                                                                    |
| `PATCH /me/profile`              | required | any subset of name and profile fields; `.strict()`, so unknown fields are refused |
| `GET /users/{id}/profile`        | none     | public fields only (no email, gender, level, country, settings); `badges: []`     |
| `POST /me/push-tokens`           | required | upsert; a token moves to whoever registered it last                               |
| `DELETE /me/push-tokens/{token}` | required | URL-encoded token; deletes only your own; 204                                     |
| anything else under `/api/v1/*`  | none     | 404 `NOT_FOUND` in the standard shape                                             |

`handler()` (`apps/web/lib/api/handler.ts`) does auth (session cookie, or `Authorization: Bearer <Supabase access token>` verified with `getClaims()`; only `role = authenticated` with a UUID `sub` passes), Zod validation of body, params and query, error mapping, the `server_time` header on every response including errors, and client-generated ids (`clientId: true` → `ctx.id`, from the body's `id` or the `Idempotency-Key` header). Unexpected errors return 500 `INTERNAL` and log only method, path, and the Postgres error code, never messages (they can contain emails). Role checks are not in it yet; Phase 2 adds them.

Error shape: `{ "error": { "code": "VALIDATION_FAILED", "message": "...", "details": { "fields": { "timezone": "..." } } } }`. Other codes put their own context in `details`. Read field problems with `fieldErrorsOf(details)` or `ApiError#fieldErrors`.

**Web UI:** design tokens from screens PDF page 1 in `apps/web/app/globals.css` (raised, inset and flat surfaces; one solid primary button; bright-green focus rings; status as dot plus word). Fonts: Inter Tight, Inter and JetBrains Mono via `next/font`. The profile form validates with the shared schema before sending and shows server field errors; it also has "Saved 12 s ago" and "Couldn't save … Retry" states from the shared-states panel.

**Mobile:** Supabase OAuth via `expo-web-browser` `openAuthSessionAsync` with PKCE and `skipBrowserRedirect`; the session lives in AsyncStorage. The profile screen calls the API with a bearer token and records the `server_time` offset (`serverNow()`) for later countdowns. Its time zone field is a text input with a "Use this phone's time zone" button.

**CI and operations**

- `.github/workflows/ci.yml`: install, `supabase start`, `pnpm db:reset`, lint, typecheck, test.
- `.github/workflows/nightly.yml`: 02:17 UTC and manual. A data-only `pg_dump` (public schema, plus `auth.users` and `auth.identities`), run in the `postgres:17` image, tarred, encrypted with GPG AES-256, and kept as an artifact for 30 days. A separate job curls `/api/v1/health` (keep-alive).
- `scripts/restore.sh`: takes the `.tar.gz.gpg` or the downloaded artifact `.zip`. It decrypts with a throwaway GnuPG home, then in one transaction truncates public tables, deletes `auth.users`, sets `session_replication_role = replica` (so the trigger doesn't duplicate rows) and loads auth, then public. Uses `psql`, or `docker exec` into `supabase_db_hackxperience`. Refuses non-local targets unless `ALLOW_REMOTE_RESTORE=yes`. Tested: zip unwrap, decryption, wrong-key message, remote guard, and the SQL stream. **Not tested: loading into a real database** (no psql or Docker on the build machine).

### How to run it

```bash
corepack enable            # once, gives you pnpm 12.21.0 from package.json
pnpm install

# Database: either the real local Supabase stack (needs Docker)...
pnpm db:start && pnpm db:reset
# ...or, without Docker, an embedded Postgres 17 on the same port (tests only; no auth server)
pnpm db:local              # keeps running; Ctrl+C stops. `pnpm db:local reset` rebuilds it.

pnpm lint && pnpm typecheck && pnpm test

# Web: copy .env.example values into apps/web/.env.local, then
pnpm dev                   # http://localhost:3000

# Mobile: copy the EXPO_PUBLIC_ values into apps/mobile/.env, then
pnpm --filter @hx/mobile start
```

Local OAuth needs real OAuth apps pointed at `http://127.0.0.1:54321/auth/v1/callback`; see the comments in `supabase/config.toml`. Both providers are off in local config so `supabase start` works without credentials.

Integration tests use the real database through the real route handlers. Only token verification is swapped (`apps/web/tests/setup.ts`: `Bearer test:<user id>`). The real `authenticate()` has its own tests: no token, malformed token, forged signature.

### New dependencies and why

| Dependency                                                                                        | Where      | Why                                                                                                          |
| ------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------ |
| turbo, typescript, eslint, typescript-eslint, prettier, vitest                                    | root, all  | Tooling named in the build plan                                                                              |
| `@eslint/js`, `globals`, `eslint-plugin-react-hooks`, `@next/eslint-plugin-next`                  | root       | Lint rules for TS, React hooks, Next.js; used directly instead of `eslint-config-next`                       |
| `supabase` (CLI)                                                                                  | root       | `pnpm db:start` etc. without a global install                                                                |
| `embedded-postgres`                                                                               | root (dev) | Runs Postgres 17 without Docker, so tests run on machines that can't run `supabase start`. Dev-only fallback |
| next, react, react-dom, `@supabase/ssr`, `@supabase/supabase-js`, zod                             | web        | Stack from the build plan                                                                                    |
| `server-only`                                                                                     | web        | Build fails if server Supabase code is imported into a client component                                      |
| postgres (postgres.js 4)                                                                          | db         | Named in the build plan                                                                                      |
| expo and Expo modules from the SDK 58 template, `@react-native-async-storage/async-storage` 2.2.0 | mobile     | App shell, router, OAuth browser, session storage (version chosen by `expo install`)                         |

Versions are pinned exactly (Expo packages use the `~` ranges `expo install` expects). TypeScript is 6.0.3, not 7: typescript-eslint supports `<6.1`. pnpm added `minimumReleaseAgeExclude` entries to `pnpm-workspace.yaml` for packages released very recently. Review them, or wait and drop the entries.

### Left out, and why

- **Events section on the landing page**: events don't exist until Phase 2. The hero uses a CSS "Enter" key instead of the keyboard illustration in the PDF, because that image asset isn't in the repository.
- **Role checks in `handler()`**: Phase 2 (build plan item 4 there).
- **Rate limiting helper**: Phase 3. The table exists.
- **Push token registration from the app**: Phase 6. The endpoints exist.
- **Custom fonts on mobile**: the app uses the system font. Load Inter, Inter Tight and JetBrains Mono when the Phase 3 screens arrive.
- **App icon and splash artwork**: none in the repository. Needed before the Phase 3 Play upload.

### Questions for a human

Moved to the Open questions register at the top.

### Notes for the human-only tasks

- Supabase Auth redirect allow-list: `https://hack.ciren.network/auth/callback`, `hackxperience://auth/callback`, and for Expo Go during development, `exp://**`.
- Turn off email/password sign-up in the Supabase dashboard (OAuth only).
- `DATABASE_URL` (Vercel): the **transaction** pooler (port 6543). `BACKUP_DATABASE_URL` (GitHub): the **session** pooler (port 5432), because GitHub runners have no IPv6 for the direct connection.
- `BACKUP_ENCRYPTION_KEY`: a long random passphrase stored in the password manager. Without it the backups can't be read.
- Optional GitHub Actions variable `HEALTH_URL` if the site isn't at `https://hack.ciren.network` yet.
- The nightly workflow assumes Postgres 17 (`PG_MAJOR`). Change it if the Supabase project runs a different major version.

### Later (noticed, not in Phase 1)

- Consider removing `public` from the PostgREST exposed schemas in the Supabase dashboard. RLS already blocks clients, so this would be defense in depth.
- Keep `users.email` in sync when someone changes their email at the provider (there's no update trigger yet).
- `rate_limit_counters` needs a cleanup step for old windows (tick, Phase 2+).
- The CI could also run `pnpm format:check`.
