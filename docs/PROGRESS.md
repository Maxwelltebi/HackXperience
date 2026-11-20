# Progress

Handoff log between phases. Each phase adds a section: what was built, how to run it, what was left out and why, new dependencies, and questions for a human. Newest phase first. The two registers below stay at the top and are updated every phase.

---

## Open questions register

One list for every open question. Agents add rows; a person answers in the **Answer** column (or in a commit message that names the ID), and the next agent applies the answer and moves the row to Resolved. **Default if unanswered** is what the code does today, so nothing blocks unless the Blocks column says so.

### Open

| ID  | Question                                                                                                                                                                                                                                                                                        | Raised | Blocks            | Default if unanswered                  | Answer |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------- | -------------------------------------- | ------ |
| Q1  | **When is the next CIReN event?** It decides the full 8-phase plan or the cut line (Phases 1–5, web only). (DESIGN Step 8)                                                                                                                                                                      | Design | Planning          | Full plan, web first                   |        |
| Q2  | **Is school public?** `GET /users/{id}/profile` is public (DESIGN Step 4) and returns name, avatar, bio, GitHub username, school.                                                                                                                                                               | P1     | —                 | School shown                           |        |
| Q3  | **GitHub accounts with no public email.** `users.email` is `not null`, so that sign-in fails. Acceptable (they use Google), or handle it? _(auth)_                                                                                                                                              | P1     | —                 | Sign-in fails with the error page      |        |
| Q4  | **Account deletion.** `audit_log.actor_id` has no cascade, so deleting a user with audit rows fails. Should accounts be deletable, and what happens to their audit rows? _(deletion)_                                                                                                           | P1     | Phase 7           | Accounts can't be deleted              |        |
| Q5  | **`EXPO_PUBLIC_API_URL`** (the web app's URL, for the mobile app) is missing from the build plan's environment table. Add it there?                                                                                                                                                             | P1     | —                 | Documented in `.env.example`           |        |
| Q6  | **Code of conduct.** Where does the sign-in page's "code of conduct" link go?                                                                                                                                                                                                                   | P1     | Launch            | Plain text                             |        |
| Q7  | Should drafts with no title and no write-up be judged? (DESIGN Step 8)                                                                                                                                                                                                                          | Design | Phase 4           | No (current rule)                      |        |
| Q9  | **Event status checks** (my choice; DESIGN names the transitions but not their checks). Publish needs an application window that closes by the event end. Back to draft only while nobody has applied. Start judging only after the submission deadline and with at least one rubric criterion. | P2     | —                 | As described                           |        |
| Q10 | **Platform admins and events** _(permissions)_. `is_platform_admin` grants nothing at events today; only event roles do. Should platform admins see and edit every event?                                                                                                                       | P2     | —                 | No automatic access                    |        |
| Q11 | **Changing a decision after RSVP** _(permissions)_. Once an applicant confirms or declines, organizers can no longer change their status (for example, removing someone for a code of conduct breach). Should owners be able to?                                                                | P2     | Phase 3           | Not possible                           |        |
| Q12 | **Drafts and non-admin staff.** Judges, mentors and volunteers can't see a draft event; only owners and admins can. OK?                                                                                                                                                                         | P2     | —                 | Owners and admins only                 |        |
| Q13 | **Profile before applying.** The application form warns when school or level of study is missing, but doesn't block. Require them?                                                                                                                                                              | P2     | —                 | Warn only                              |        |
| Q8  | Real CIReN event sizes, to recheck the DESIGN Step 2 estimates.                                                                                                                                                                                                                                 | Design | Phase 7 load test | 500 applicants, 300 accepted, 80 teams |        |

### Resolved

| ID  | Question                                                                                       | Resolution                                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Design doc missing                                                                             | Added 19 Nov 2026; copied to `docs/DESIGN.md`.                                                                                                                                                        |
| R2  | Header name `server_time` vs `Server-Time`                                                     | DESIGN Step 4 says `server_time`. Kept.                                                                                                                                                               |
| R3  | Error code names                                                                               | DESIGN only fixes the shape and the domain codes (`TEAM_FULL`, `STALE_VERSION`, …). The generic codes stay.                                                                                           |
| R4  | Should the public profile require sign-in?                                                     | No: DESIGN Step 4 says "anyone". School is still open (Q2).                                                                                                                                           |
| R5  | Error `details` shape                                                                          | DESIGN Step 4 shows `"details": {}`. Changed from an array to an object; validation problems are under `details.fields` as `{ "path": "message" }`.                                                   |
| R6  | `DELETE /me/push-tokens` body vs path                                                          | DESIGN Step 4: `DELETE /me/push-tokens/{token}`. Changed.                                                                                                                                             |
| R8  | Applying twice                                                                                 | Returns the first application (`200`) instead of an error, so a mobile retry is harmless (Agent rule 14).                                                                                             |
| R9  | Tick lock with a transaction-mode pooler                                                       | `pg_try_advisory_xact_lock`, not the session lock the build plan names: through Supavisor in transaction mode a session lock can stick to a pooled connection forever. See `packages/db/src/tick.ts`. |
| R7  | Retry-safe creates: body `id` (build plan rule 14) vs `Idempotency-Key` header (DESIGN Step 4) | `handler({ clientId: true })` accepts either; if both are sent they must match.                                                                                                                       |

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

Phase 2 added nothing on mobile. `/me` now also returns `event_roles` and `org_ids`; the app parses them through the shared schema.

Known gaps: the time zone field is free text (validated by the API), not a picker; the mobile profile shows fewer fields than the web.

---

## Phase 2: Events, roles, applications, email (built 19 Nov 2026, gate not yet run)

### Status

| Check                                                          | Result                                                                                                                                           |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Migrations 0001–0004 apply cleanly to an empty database        | Passed locally (0004 prints a notice and skips scheduling on Postgres without pg_cron, as designed)                                              |
| `pnpm lint && pnpm typecheck && pnpm test`                     | Passed: 214 tests (core 62, emails 7, shared 22, db 21, web 98, mobile 4), three full runs in a row, none skipped                                |
| `next build`                                                   | Passed; client bundles contain no secrets, the database driver or the AWS SDK                                                                    |
| Public pages (landing events section, `/events`, event page)   | Checked in a browser at desktop and phone widths                                                                                                 |
| Organizer screens and the apply flow in a browser              | **Not checked.** They need a real sign-in (Supabase Auth), which this machine doesn't have. Their API calls are covered by the integration tests |
| Real SES email, Gmail SPF/DKIM/DMARC, pg_cron calling the tick | **Not run.** Needs the human-only setup for Phase 2                                                                                              |

**Local test note:** this PC has about 0.6 GB of free RAM while VS Code and browsers are open. Under that pressure, database tests sometimes timed out (connection setup took over 10 s). The fix applied: `pnpm test` runs packages one at a time and database test files one at a time, with small connection pools. CI on Linux doesn't have this problem.

### What was built

**Migrations**

- `0002_events`: `events`, `event_staff`, `tracks`, `schedule_items`, `rubric_criteria`, `awards`, `applications`, exactly as the Canonical schema. RLS on, no policies.
- `0003_notifications`: `notification_outbox`, `email_suppressions`, and the pending-rows index.
- `0004_cron`: `pg_cron` + `pg_net` job `hx-tick` every minute, reading `hx_tick_url` and `hx_tick_secret` from Vault. It does nothing until both secrets exist.

**`packages/core`** (pure, 62 tests): event status machine (`checkEventTransition`, every allowed and refused pair tested), application decisions and RSVP (`decideApplication`, `rsvpApplication`), `applicationsOpen`, `validateAnswers` (types `short_text`, `long_text`, `single_choice`, `multi_choice`, `url`), `validateEventTimes`, `slugify`, `generateTicketCode` (128 random bits, 22 URL-safe characters).

**`packages/shared`:** the permission matrix (`PERMISSIONS`, `can()`), DESIGN Step 4 exactly; event, setup and application schemas; time helpers (`zonedToUtc`, `utcToZoned`, `formatDateTime`). New error codes: `USER_NOT_FOUND`, `INVALID_TRANSITION`, `LAST_OWNER`, `APPLICATIONS_CLOSED` (423). `/me` now returns `event_roles` and `org_ids`.

**`packages/emails`:** decision emails (accepted, waitlisted, rejected) in HTML and plain text, escaped.

**`packages/db`**

- `loadEventRoles(sql, eventId, userId)`. Drafts are visible only to owners and admins.
- Events: create (creator becomes owner, audited), update (field-level before and after audit), status change (row locked, database clock, audited).
- Staff: add by email (`USER_NOT_FOUND` if they never signed in), remove (`LAST_OWNER` guard). Both audited.
- Setup CRUD for tracks, schedule, rubric, awards. Deletes are audited; a track with an award can't be deleted; one tiebreaker per rubric.
- Applications: apply (window checked against `now()`), my application, RSVP (confirm sets `ticket_code`), review list (cursor pagination, status filter, search, tab counts), bulk decisions.
- Bulk decisions: rows locked in id order (no deadlocks); one `audit_log` row and one outbox row each; `send_after = now() + 10 min`; dedupe key `decision:{applicationId}:{status}`. A decision changed back revives its superseded email row.
- Outbox worker: claim with `FOR UPDATE SKIP LOCKED` and a 2-minute `locked_until`. Retries at 1, 5, 30 and 120 minutes; failed after 5 attempts; stuck rows recovered. It re-reads the application before sending (marks it `superseded` if changed) and checks suppressions first. Email addresses are scrubbed from `last_error`.
- `runTick`: transaction-scoped advisory lock (see R9), then the outbox. With email not configured, rows wait instead of failing.

**API** (`/api/v1`, all through `handler()`; `handler({ event: { permission } })` gives 404 for unseen events, 403 for missing roles)

| Endpoint                                                                                 | Who                                                                                                          |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `POST /orgs/{orgId}/events`                                                              | org member                                                                                                   |
| `GET /events`, `GET /events/{id}`, `GET /events/{id}/setup`                              | anyone (drafts: owner, admin)                                                                                |
| `PATCH /events/{id}`, `POST /events/{id}/status`                                         | owner, admin                                                                                                 |
| `GET`, `POST`, `DELETE /events/{id}/staff`                                               | owner                                                                                                        |
| `GET`, `POST /events/{id}/{tracks,schedule,rubric,awards}`; `PATCH`, `DELETE …/{itemId}` | read: anyone who sees the event; write: owner, admin                                                         |
| `POST /events/{id}/applications`                                                         | signed in, while open                                                                                        |
| `GET /events/{id}/applications/me`, `POST …/me/rsvp`                                     | the applicant                                                                                                |
| `GET /events/{id}/applications?status=&q=&cursor=&limit=`, `POST …/decisions`            | owner, admin                                                                                                 |
| `POST /api/internal/tick`                                                                | `x-tick-secret` header = `TICK_SECRET` (constant-time compare)                                               |
| `POST /api/internal/ses-events`                                                          | SNS signature (v1 and v2), AWS cert host, topic and age checked; permanent bounces and complaints suppressed |

Database errors are mapped: unique or foreign-key conflicts → `409 CONFLICT`, check violations → `400`, deadlocks or lock timeouts → `503`.

**Web UI**

- Landing: real "Upcoming hackathons" and "Past CIReN events" (screens PDF page 2).
- `/events`, `/events/[slug]` (tracks, schedule, dates in the viewer's zone, application status and RSVP), `/events/[slug]/apply`.
- `/organize` (your events, New event), `/organize/new`, and the organizer shell from PDF page 8. Its pages:
  - Overview: status actions and the event form, with times entered in the event's zone.
  - Applications: tabs with counts, search, bulk Accept, Waitlist and Reject with the 10-minute note, detail panel, Load more.
  - Tracks and schedule: tracks, schedule, rubric, awards.
  - Application form: question editor.
  - Staff.

**Tests that the plan requires, all present:** every allowed and refused status transition; one refused test per role (volunteer, judge, mentor and participant can't list or decide applications, edit, change status or add tracks; admin can't manage staff); answer validation; 50 decisions give 50 audit rows and 50 outbox rows; the undo window sends only the latest; two concurrent workers never send the same row; suppressed addresses never sent to; forged, tampered, off-site-cert, wrong-topic and stale SNS messages rejected.

### How to run it

Same as Phase 1, plus:

- Organizer screens need an account that is a CIReN `org_members` row. Locally the seed makes Kwame one, but seed users can't sign in (OAuth only). With a dev Supabase project, add yourself: `insert into org_members (org_id, user_id) values ('00000000-0000-4000-8000-00000000c12e', '<your user id>');`
- The seed includes a published demo event, _The CIReN Experience 5.0_, with two applications.
- Emails: without AWS settings the tick leaves decision emails in `notification_outbox` (status `pending`), so you can inspect them.

### New dependencies

| Dependency                           | Where   | Why                                                             |
| ------------------------------------ | ------- | --------------------------------------------------------------- |
| `@aws-sdk/client-sesv2` 3.1172.0     | web     | SES `SendEmail` (named in the build plan)                       |
| `@hx/core`, `@hx/emails` (workspace) | db, web | State machines and templates used by the queries and the worker |

### CI fix (20 Nov 2026)

CI failed at `supabase start` on every commit. Supabase CLI 3 rejects the old `[inbucket]` section in `supabase/config.toml` ("no longer supported, use local_smtp"). It is renamed `[local_smtp]`, and email sign-in is now turned off with `[auth.email] enabled = false`. The CLI now loads the whole config; checked locally with `supabase start`, which then stops only because this machine has no Docker. The next run (commit `4efb1fb`) got further. All four migrations and the seed applied cleanly on the real Supabase image, but the email-catcher container couldn't bind port 54324 ("address already in use"). We don't need it (sign-in is OAuth only; our email goes through SES), so `[local_smtp]` is now `enabled = false`. Lint, typecheck and tests haven't run on CI yet; they pass from a fresh clone against the no-Docker database.

The nightly workflow also fails, as expected until setup: `hack.ciren.network` doesn't resolve yet (keep-alive) and the `BACKUP_*` secrets aren't set.

### Left out, and why

- **Export CSV** on the applications screen: reports and CSV are Phase 7.
- **Ticket QR**: Phase 3. Confirming already creates the `ticket_code`.
- **Check-ins, Teams, Submissions, Judging, Live dashboard, Announcements, Reports, Audit log** sidebar items: their phases. Hidden, not shown as dead links.
- **Markdown in event descriptions**: shown as plain text with line breaks.
- **`database.types.ts`** still covers 0001 only. Run `pnpm db:types` with Docker to regenerate it.

### Human tasks for the Phase 2 gate

- `TICK_SECRET` in Vercel. In the Supabase SQL editor run `select vault.create_secret('https://hack.ciren.network/api/internal/tick', 'hx_tick_url');` and `select vault.create_secret('<same TICK_SECRET>', 'hx_tick_secret');`.
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SES_FROM`, `SES_REPLY_TO`, `SNS_TOPIC_ARN`, `APP_URL` in Vercel.
- Point the SNS subscription at `https://hack.ciren.network/api/internal/ses-events`. The endpoint confirms the subscription itself.

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
