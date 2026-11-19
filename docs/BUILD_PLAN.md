# HackXperience: Agentic Build Plan

Nov 18, 2026 · @Maxwell Tebi

## How to use this document

Run one phase per coding-agent session, in order, and do not start the next phase until a person has passed the current phase's gate. The design doc, HackXperience: System Design, explains why; this document says what to build and how to check it.

1. Before Phase 1, a person completes the human-only tasks for that phase (accounts, DNS, secrets).
2. Start a fresh agent session in the repository. Paste the prompt below with the phase number filled in.
3. The agent builds the phase, keeps CI green, and updates `docs/PROGRESS.md`.
4. A person runs the phase's gate checklist. Failures go back to the same session as a list.
5. Commit, tag the phase (`phase-1-done`), and move on.

### Reusable agent prompt

```markdown
You are building Phase N of HackXperience, CIReN's hackathon platform.

Before writing code, read:
1. AGENTS.md (rules you must follow)
2. docs/PROGRESS.md (what earlier phases built and left open)
3. The "Phase N" section of docs/BUILD_PLAN.md
4. The sections of docs/DESIGN.md that Phase N names

Build only what Phase N lists. Work in this order: migrations, then pure logic in packages/core with unit tests, then API endpoints with integration tests, then UI.

Run `pnpm lint && pnpm typecheck && pnpm test` until everything passes. Do not mark the phase done with failing or skipped tests.

When finished, update docs/PROGRESS.md with: what you built, how to run it, anything you left out and why, and questions for a human. Then stop. Do not start Phase N+1.
```

Export this document and the design doc into the repository as `docs/BUILD_PLAN.md` and `docs/DESIGN.md` so the agent can read them offline.

## Roadmap

Eight phases, about one week each of Thursday to Sunday engineering; if the next event comes early, stop after Phase 5 and run it on web.

&#91;embedded content: roadmap · 8 phases, one gate each, cut line after Phase 5\]

The Android closed test starts in Phase 3 so its 14 days pass before Phase 8 asks for production access.

## Agent rules (AGENTS.md)

Copy this section into `AGENTS.md` at the repository root (and `CLAUDE.md` if you use Claude Code); every rule here applies to every phase.

### Scope

1. Build only the current phase. Anything else you notice goes under "Later" in `docs/PROGRESS.md`.
2. When the design doc is unclear about permissions, deletion, auth, or deadlines, stop and write the question in `docs/PROGRESS.md`. Do not guess.
3. Add a dependency only when it removes real work. Record each new dependency and its reason in `docs/PROGRESS.md`.

### Database

4. Every schema change is a new file in `supabase/migrations/`. Never edit a migration that has run. Changes must be backward-compatible: add first, remove in a later release.
5. Tables, columns, and constraints come from the Canonical schema section. A change to it is a design change: write it in `docs/PROGRESS.md` for a human to approve.
6. Row-level security is enabled on every public table with no client policies. Clients never read or write tables directly; the API connects as the table owner. The only client policies are on `realtime.messages` (Phase 6).
7. Deadline-sensitive writes (submission save, submit, team join, leave, remove) start with `SELECT ... FROM events WHERE id = $1 FOR SHARE` and reject with `SUBMISSION_LOCKED` if `submissions_locked_at` is set or `now() >= submission_deadline`.
8. Lock order is always: event row, then team row, then anything else.
9. Never make a network call (GitHub, SES, Expo) inside a database transaction.
10. Rules that depend on time use the database's `now()`, never the client's clock.

### API

11. Every endpoint lives under `apps/web/app/api/v1/` and uses the shared `handler()` wrapper: auth, role check, Zod validation, error mapping, and the `server_time` header.
12. Request and response shapes are Zod schemas in `packages/shared`. Web and mobile import the same schemas.
13. Errors use the one shape and the codes in `packages/shared/src/errors.ts`. Add a code there before using it.
14. Creates from the mobile app accept a client-generated UUID `id`. Insert with `ON CONFLICT (id) DO NOTHING` and return the existing row, so a retry is harmless.
15. Write an `audit_log` row for: status changes, application decisions, manual check-ins, member removals, scores, awards, reopening submissions, deletes and restores.
16. Notifications are rows in `notification_outbox`, written in the same transaction as the change. Never send email or push from a request handler.

### Security

17. The Supabase service-role key, database URL, AWS keys, GitHub token, and tick secret exist only in server environment variables. Never import them in client code. Never log them, or full email addresses.
18. Internal endpoints check their secret (`/api/internal/tick`) or the SNS message signature (`/api/internal/ses-events`) before doing anything.

### Tests and done

19. Pure logic (state transitions, standings, assignment, invite codes) has unit tests with fixed inputs. Every endpoint has an integration test against the local Supabase database, including one test per role that must be refused.
20. Concurrency tests named in a phase run real parallel requests against Postgres. They must pass every run, not most runs.
21. A phase is done when: migrations apply cleanly to an empty database, `pnpm lint && pnpm typecheck && pnpm test` pass, the app deploys, and `docs/PROGRESS.md` is updated.

### Style

22. TypeScript strict mode, no `any`. Small functions. Names from the design doc (`submissions_locked_at`, not `isLocked`).
23. Times are stored and sent in UTC ISO 8601; the UI converts to the user's chosen timezone.

## Repository, tooling, and environment

One TypeScript monorepo holds the web app, the mobile app, shared code, and the database migrations.

```text
hackxperience/
  apps/
    web/              Next.js App Router: pages and /api/v1 route handlers
    mobile/           Expo Router app (Android)
  packages/
    shared/           Zod schemas, API types, error codes, constants
    core/             pure domain logic: state machines, standings, judge assignment, invite codes
    db/               SQL access (postgres.js), transaction and lock helpers
    emails/           email templates (HTML and plain text)
  supabase/
    migrations/       SQL migrations, the source of truth for the schema
    seed.sql          local test data
  scripts/            backup, restore, load test
  .github/workflows/  ci.yml, nightly.yml
  docs/
    DESIGN.md         exported design doc
    BUILD_PLAN.md     exported build plan
    PROGRESS.md       agent handoff log, updated every phase
    RUNBOOK.md        written in Phase 7
  AGENTS.md           agent rules
```

### Tooling choices

| Need | Choice | Reason |
| --- | --- | --- |
| Package manager and tasks | pnpm workspaces, Turborepo | Shared packages, cached builds |
| Database access on the server | postgres.js with plain SQL | Row locks (`FOR SHARE`, `FOR UPDATE`, `SKIP LOCKED`) stay visible in the code |
| Database types | `supabase gen types typescript` | Types follow the migrations |
| Validation | Zod | One schema for web, mobile, and API |
| Auth and realtime on clients | Supabase JS client | Sign-in and channel subscriptions only |
| Tests | Vitest; Playwright for web end-to-end (Phase 7) |  |
| Local database | Supabase CLI (`supabase start`) | Same Postgres, auth, and realtime as production |
| Email | AWS SDK v3, SESv2 client |  |
| Push | Expo server SDK |  |
| Load test | k6 | Phase 7 |

Use the current stable version of each tool when Phase 1 starts, and pin exact versions.

### Commands

| Command | Does |
| --- | --- |
| `pnpm dev` | Runs the web app against the local database |
| `pnpm db:start` | `supabase start` |
| `pnpm db:reset` | Applies all migrations to an empty local database, then the seed |
| `pnpm db:types` | Regenerates database types |
| `pnpm lint`, `pnpm typecheck`, `pnpm test` | Must all pass before a phase is done |
| `pnpm --filter mobile start` | Runs the Expo app |

### Environment variables

| Name | Where | Phase |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web, mobile (`EXPO_PUBLIC_` prefix) | 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel server only | 1 |
| `DATABASE_URL` | Vercel server only; Supabase pooler, transaction mode | 1 |
| `BACKUP_DATABASE_URL`, `BACKUP_ENCRYPTION_KEY` | GitHub Actions secrets | 1 |
| `TICK_SECRET` | Vercel server, Supabase Vault | 2 |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Vercel server only | 2 |
| `SES_FROM`, `SES_REPLY_TO` | Vercel server | 2 |
| `SNS_TOPIC_ARN` | Vercel server | 2 |
| `GITHUB_TOKEN` | Vercel server only | 4 |
| `EXPO_ACCESS_TOKEN` | Vercel server only | 6 |

`SES_FROM` is `HackXperience by CIReN <hackathons@notify.ciren.network>` and `SES_REPLY_TO` is `admin.cirenet@gmail.com`.

## Human-only tasks

An agent cannot create accounts, prove identity, change DNS, or wait for approvals, so these tasks belong to a person and are listed by the phase that needs them. Start the slow ones (SES production access, the Play closed test) as early as possible.

### Before Phase 1

- [ ] Create every account under a CIReN email: GitHub (repository), Vercel, Supabase, Expo, Google Cloud (OAuth client), AWS, Google Play
- [ ] Supabase project in a European region (London or Frankfurt if offered); note the region
- [ ] Vercel project with its function region set to the same city, and hack.ciren.network pointed at it with a CNAME record
- [ ] Google OAuth client and GitHub OAuth app; add both as providers in Supabase Auth, with redirect URLs for web and the Expo app scheme
- [ ] Store every login in a shared password manager with one technical person in Ghana
- [ ] Add the Phase 1 secrets to Vercel and GitHub Actions

### Before Phase 2

- [ ] AWS account on the Paid plan, root MFA, zero-spend budget, $1 alert
- [ ] SES: verify `notify.ciren.network` (Easy DKIM), custom MAIL FROM `bounce.notify.ciren.network`, DMARC record, switch to à la carte pricing
- [ ] Request SES production access (draft in the design doc)
- [ ] IAM user limited to `ses:SendEmail` on the identity; keys into Vercel
- [ ] SNS topic for SES bounces and complaints; its subscription URL is set after Phase 2 deploys
- [ ] Verify two test inboxes in SES while still in the sandbox

### Before Phase 3

- [ ] Google Play developer account ($25), app created as HackXperience by CIReN with package network.ciren.hackxperience, closed testing track ready
- [ ] 15 testers recruited from the CIReN team and the AWS club (12 needed for 14 continuous days)

### Before Phase 4

- [ ] GitHub token from a CIReN account with read access to public repositories; into Vercel

### Before Phase 6

- [ ] Expo access token; Firebase Cloud Messaging credentials for Android push, uploaded through `eas credentials`

### Before Phase 8

- [ ] 15 to 20 people booked for a dry-run hackathon
- [ ] Runbook walkthrough with the Ghana-based operator

## Phase 1: Foundations

Phase 1 delivers a deployed monorepo where a person can sign in with Google or GitHub on web and Android, edit a profile, and where the database is backed up every night.

**Design doc sections:** Summary, Step 3 (identity tables), Step 4 (conventions, profile endpoints), Step 5 (stack), Step 7 (backups, keep-alive).

**Build**

1. Monorepo scaffold from the Repository section: pnpm, Turborepo, TypeScript strict, ESLint, Prettier, Vitest.
2. Migration `0001_identity`: enum types used later, `users`, `profiles`, `organizations`, `org_members`, `push_tokens`, `audit_log`, `rate_limit_counters`. RLS enabled on all, no client policies. Seed the CIReN organization.
3. A trigger on `auth.users` insert that creates the matching `users` and `profiles` rows from the OAuth email and name.
4. `packages/shared`: error codes and the error shape, base Zod schemas, the `server_time` header name.
5. `packages/db`: a postgres.js client on `DATABASE_URL`, a `tx()` helper, an `audit()` helper.
6. `apps/web`: Google and GitHub sign-in with Supabase SSR helpers; sign-out; a profile page with timezone (default UTC) and email reminder settings.
7. The `handler()` wrapper: session or bearer token, Zod validation, error mapping, `server_time` header, client-generated id support.
8. Endpoints: `GET /api/v1/health` (runs `select 1`), `GET /me`, `PATCH /me/profile`, `GET /users/{id}/profile` (badges empty until Phase 5), `POST` and `DELETE /me/push-tokens`.
9. `apps/mobile`: Expo Router shell; Google and GitHub sign-in through Supabase OAuth with the app's deep-link scheme; a profile screen.
10. `.github/workflows/ci.yml`: install, `supabase start`, `db:reset`, lint, typecheck, test.
11. `.github/workflows/nightly.yml`: encrypted `pg_dump` kept as a 30-day artifact, plus a request to `/api/v1/health` (keep-alive). Also runnable by hand.
12. `scripts/restore.sh`: restores a dump into the local database.
13. `docs/PROGRESS.md` created with the handoff format.

**Tests that must pass**

- A new auth user produces exactly one `users` row and one `profiles` row.
- Unauthenticated calls get `401` in the standard error shape; invalid bodies get `400 VALIDATION_FAILED` with field details.
- `PATCH /me/profile` rejects an unknown timezone name.
- Every response carries `server_time`.

**Out of scope:** events, roles, email sending.

**Gate**

- [ ] Sign in on the deployed web app with Google, then with GitHub; edit the profile
- [ ] Sign in on the Android app in development
- [ ] Run the nightly workflow by hand, then restore its dump locally with `scripts/restore.sh`
- [ ] CI is green on the main branch

## Phase 2: Events, roles, applications, email

Phase 2 delivers the full application cycle: an organizer creates an event, students apply, the organizer accepts in bulk, and decision emails arrive through SES with an undo window.

**Design doc sections:** Step 1 (roles, phases), Step 3 (event and application tables), Step 4 (setup and application endpoints, permission matrix, five rules), Step 5 (SES setup), Step 6 part 5 (outbox).

**Build**

1. Migration `0002_events`: `events` (all columns, including `submissions_locked_at`, `results_snapshot`, `deleted_at`), `event_staff`, `tracks`, `schedule_items`, `rubric_criteria`, `awards`, `applications`.
2. Migration `0003_notifications`: `notification_outbox`, `email_suppressions`, plus indexes from the Canonical schema.
3. `packages/core`: the event status state machine (draft, published, live, judging, completed) with the checks each transition requires; the application status state machine.
4. Role loading: `loadEventRoles(eventId, userId)` and the `roles` option of `handler()`. Implement the permission matrix exactly.
5. Setup endpoints: create, read, update events; `POST /events/{id}/status`; staff add and remove; CRUD for tracks, schedule, rubric, awards.
6. Staff invites by email: the person must have signed in once. Otherwise return `USER_NOT_FOUND` with a message asking them to sign in first. (v1 rule; no pending invites.)
7. Application questions: a JSON array of `{id, type, label, required, options?}` with types `short_text`, `long_text`, `single_choice`, `multi_choice`, `url`. Answers are validated against it.
8. Application endpoints: apply (only while open), my status, list with cursor and status filter, bulk decisions, RSVP. Confirming generates a random `ticket_code` (unique, URL-safe, at least 16 characters).
9. Bulk decisions write one `audit_log` row and one outbox row per application. Decision emails get `send_after = now() + 10 minutes` and dedupe key `decision:{applicationId}:{status}`.
10. Outbox worker in `packages/db`: claim with `FOR UPDATE SKIP LOCKED`, `locked_until`, retries at 1, 5, 30, 120 minutes, `failed` after 5 attempts, stuck-row recovery. Before a decision email, re-read the application; if the status changed, mark `superseded`.
11. SES sender (SESv2 `SendEmail`), suppression check first; templates in `packages/emails` with HTML and plain text.
12. `POST /api/internal/tick`: checks `TICK_SECRET`, takes `pg_try_advisory_lock`, runs the outbox step. Later phases add steps here.
13. Migration `0004_cron`: `pg_cron` and `pg_net` schedule that calls the tick every minute, reading the URL and secret from Supabase Vault.
14. `POST /api/internal/ses-events`: verify the SNS signature, confirm the subscription, record bounces and complaints in `email_suppressions`.
15. Web UI: organizer event setup, application review table with bulk actions; participant event page, application form, status page.

**Tests that must pass**

- Every allowed and refused status transition.
- The permission matrix: one refused test per role (for example, a volunteer cannot list applications).
- Answers validation: missing required answer, wrong option, bad URL.
- Bulk decision of 50 applications creates 50 audit rows and 50 outbox rows.
- Undo window: a decision changed within 10 minutes sends only the latest.
- Two workers running at once never send the same row.
- A suppressed address is never sent to.
- A forged SNS message is rejected.

**Out of scope:** tickets and check-in screens, teams, push notifications.

**Gate**

- [ ] Create a test event, apply from a second account, accept it
- [ ] The decision email arrives 10 minutes later; Gmail's "Show original" shows SPF, DKIM, and DMARC all PASS
- [ ] Change a decision within 10 minutes; only the final one arrives
- [ ] The audit log shows both decisions

## Phase 3: Tickets, check-in, teams, first Android build

Phase 3 delivers check-in at the door and team formation that holds under concurrent joins, and puts the first Android build into the Play closed test so the 14-day clock starts.

**Design doc sections:** Step 1 (teams, check-in), Step 3 (participation tables), Step 4 (check-in and team endpoints), Step 6 part 2 (team joins), Step 7 (Wi-Fi failure, manual check-in).

**Build**

1. Migration `0005_participation`: `check_ins`, `teams`, `team_members`, with the composite foreign key that keeps a member's `event_id` equal to the team's.
2. `GET /events/{id}/me/ticket` and a QR code of the `ticket_code` on web and mobile.
3. `POST /events/{id}/check-ins` with `{ticket_code}`. A second scan returns `ALREADY_CHECKED_IN` with the first time. The result screen shows the person's name.
4. The scanner (mobile, and web with the browser camera) checks connectivity first. Offline, it shows "You're offline. Connect to check people in." and does not scan.
5. `POST /events/{id}/check-ins/manual`: search by name or email, audited.
6. `packages/core`: invite code generator (8 characters, no 0, O, 1, I, or L) and the rate-limit helper on `rate_limit_counters`.
7. Team endpoints: create (client-generated id), join, leave, rotate code, remove member, my team, find-a-team board with `looking_for_members` and `looking_for`.
8. Join follows the design exactly: event row `FOR SHARE`, team row `FOR UPDATE`, count, insert; map the unique violation to `ALREADY_ON_TEAM`; `TEAM_FULL` and `INVALID_INVITE_CODE` as specified; 10 attempts per user per minute.
9. Leave: ownership passes to the earliest joiner; the last member leaving soft-deletes the team.
10. Joins and leaves after the deadline return `SUBMISSION_LOCKED` (Agent rule 7 applies from this phase).
11. Mobile screens: events list, event page, ticket, my team (create, join by code, leave), volunteer scanner.
12. EAS build profile for Android (app name HackXperience, package network.ciren.hackxperience, which cannot change after the first upload) and a first build for the closed test track.

**Tests that must pass**

- 20 simultaneous joins for 1 open slot: exactly 1 succeeds, 19 get `TEAM_FULL`. Run it 20 times in CI; all 20 pass.
- One user joining two teams at the same moment: exactly one succeeds.
- Joins and the event lock running together never deadlock.
- An 11th join attempt in a minute gets `RATE_LIMITED`.
- A volunteer cannot read applications; a participant cannot check people in.
- Generated codes never contain look-alike characters.

**Out of scope:** submissions, the deadline tick, push notifications.

**Gate**

- [ ] A volunteer scans a ticket on an Android phone on mobile data; a second scan shows the first time
- [ ] Manual check-in appears in the audit log
- [ ] Three accounts form a team; a fourth is refused when the size limit is 3
- [ ] The build is in the closed test and 15 testers have opted in (note the date the 14 days started)

## Phase 4: Submissions and the deadline lock

Phase 4 delivers the submission editor and a deadline that cuts over cleanly: every save either lands before the lock or is rejected, drafts are auto-submitted, and commit hashes are captured.

**Design doc sections:** Step 1 (submission phase), Step 3 (submission tables), Step 4 (submission save, five rules), Step 6 part 1 (deadline lock), Step 7 (reopen after an outage).

**Build**

1. Migration `0006_submissions`: `submissions`, `submission_tracks`, indexes.
2. `GET` and `PUT /events/{id}/teams/me/submission`. `PUT` requires `If-Match` with the current `version`; it returns `409 STALE_VERSION` on a mismatch and increments `version` on success.
3. Link checks: GitHub links match `github.com/{owner}/{repo}`; YouTube links are YouTube domains; demo links are `https`. Tracks are limited to `max_tracks_per_submission`.
4. `POST .../submission/submit`: needs a title, a write-up, and at least `team_size_min` members. Editing after submit keeps the status `submitted`.
5. Tick step "lock deadlines": for each event with `submission_deadline <= now()` and `submissions_locked_at IS NULL`, run the lock transaction from the design doc: exclusive event lock, auto-submit drafts with a title and write-up (`auto_submitted = true`), mark teams under `team_size_min` with `below_min_size`, set `submissions_locked_at`, write an audit row, set `sha_status = 'pending'` where a GitHub link exists.
6. Tick step "capture hashes" (outside any transaction): for pending rows, fetch the default branch's latest commit with `GITHUB_TOKEN`; store it as `captured` with `sha_fetched_at`; a 404 becomes `unreachable`; network errors stay `pending` for the next tick.
7. `POST /events/{id}/submissions/reopen` (owner only): new deadline later than now, clears `submissions_locked_at`, audited.
8. Tick step "reminders": outbox rows at 24 hours and 1 hour before the deadline for teams with an unsubmitted draft, dedupe key `reminder:{eventId}:{userId}:{24h or 1h}`, email only if `email_reminders` is on.
9. Web and mobile countdowns use the `server_time` offset, not the device clock.
10. Web submission editor: markdown write-up with preview, three link fields, track picker, Submit button, save-conflict screen showing the teammate's version.

**Tests that must pass**

- 50 saves timed around the deadline while the lock runs: each save appears in the locked data or got `423`. None are lost.
- The lock step run twice, or by two ticks at once, changes nothing the second time.
- A tick that runs 10 minutes late locks the event; no save between the deadline and the late tick was accepted.
- Auto-submit includes drafts with a title and write-up and skips empty drafts.
- Hash capture with a mocked GitHub: success, 404, network failure then success.
- Two teammates saving with the same version: one gets `409`.
- Reopen restores saving until the new deadline.

**Out of scope:** judging, results, live updates to teammates.

**Gate**

- [ ] Run a test event with the deadline 5 minutes ahead; keep editing through the deadline
- [ ] The save after the deadline is refused; the draft was auto-submitted; the hash appears within 2 minutes
- [ ] Reopen works and is in the audit log

## Phase 5: Judging and results

Phase 5 delivers fair judging and published results: balanced judge assignment, rubric scoring, z-score standings, awards chosen by organizers, a frozen results snapshot, and winner badges on profiles. With this phase, the platform can run a whole event (the cut line).

**Design doc sections:** Step 1 (judging, results), Step 3 (judging tables), Step 4 (judging endpoints, permission matrix), Step 6 part 3 (judging math).

**Build**

1. Migration `0007_judging`: `judge_assignments`, `scores`, `award_winners`.
2. `packages/core/assignJudges(submissions, judges, perSubmission, conflicts, seed)`: shuffle with the seed, give each submission the judges with the fewest assignments, break ties at random, skip conflicts. Judges on a team in the event are always conflicts.
3. `packages/core/computeStandings(scores, criteria, assignments)`: weighted total 0 to 100 per judge per submission; z-score per judge; pooled mean and spread for judges with fewer than 4 scores or a spread of 0; average z per submission; overall and per-track rankings; ties broken by the tiebreaker criterion, then reported as ties.
4. Endpoints: assign, my queue, view an assigned submission, put my scores (all criteria in one request, each within `max_score`, only while the status is `judging`), standings (raw and normalized side by side, plus progress such as "212 of 240 scores in"), assign award winners.
5. Moving the event to `completed` saves `results_snapshot` from the current standings and awards, in one transaction.
6. Public endpoints after `completed`: results from the snapshot, the submission gallery, each team's anonymized judge comments.
7. `GET /users/{id}/profile` now returns badges computed from `award_winners` and `team_members`.
8. Judge scoring screens on web and mobile; organizer standings and awards screen; public results and gallery pages.

**Tests that must pass**

- The design doc's case: a generous judge scoring 9 (mean 8.5, spread 0.5) ranks below a harsh judge's 6 (mean 4.5, spread 1.0).
- Fallbacks for a judge with 3 scores and for a judge with identical scores.
- Tie broken by the tiebreaker; an exact tie reported as a tie.
- Assignment: every submission gets exactly N judges; judge loads differ by at most 1; no conflicts; the same seed gives the same result.
- A judge cannot read an unassigned submission or score outside `judging`.
- Editing a score after publication does not change the published results.

**Out of scope:** realtime judging progress, push notifications for results.

**Gate**

- [ ] Score the Phase 4 test event with 3 judge accounts, one deliberately harsh
- [ ] The standings show raw and normalized scores; the harsh judge's favorite rises
- [ ] Publish results; a winner's profile shows the badge; the gallery is public

## Phase 6: Live features

Phase 6 delivers what happens during the event: push announcements, a mentor help queue that updates live, and a staff dashboard with live counts, all on private realtime channels.

**Design doc sections:** Step 1 (during the event), Step 3 (announcements, mentor requests), Step 4 (live endpoints), Step 6 parts 4 and 5 (realtime channels, push through the outbox).

**Build**

1. Migration `0008_live`: `announcements`, `mentor_requests` (primary key accepts a client-generated id).
2. Migration `0009_realtime_policies`: SQL helpers `is_event_staff(event_id, user_id, role)` and `is_team_member(team_id, user_id)`; row-level security policies on `realtime.messages` so each channel in the design doc admits only its subscribers.
3. A broadcast helper that sends from the database inside the write's transaction (or, if that is not available, calls the HTTP broadcast only after commit). Messages are hints: `{type, id, version}`; staff counters carry numbers.
4. Push sender in the outbox worker: Expo batches, tickets stored, a tick step that checks receipts and deletes tokens on `DeviceNotRegistered`.
5. Announcements: create (saves, queues push to all confirmed participants and staff), list with `since`.
6. Mentor queue: create request (team member), list open (mentor), claim with one conditional `UPDATE ... WHERE status = 'open'` (the loser gets `ALREADY_CLAIMED`), resolve, cancel. Timestamps feed response times.
7. Broadcasts on the design doc's channels: `event:{id}:staff`, `event:{id}:mentors`, `event:{id}:announcements`, `team:{id}`, `user:{id}`.
8. A client hook used on web and mobile, `useLiveChannel(topic, refetch)`: subscribe first, then fetch; ignore messages older than the shown version; refetch on every reconnect; poll every 30 seconds if the subscription fails.
9. Screens: announcements (organizer composer, participant feed), mentor queue (mentor view, team request form), staff dashboard (check-ins, submissions, judging progress), teammate-saved notice in the submission editor.
10. Mobile registers its push token after sign-in and on token change.

**Tests that must pass**

- A participant cannot subscribe to `event:{id}:staff` or another team's channel.
- Two mentors claiming at the same moment: exactly one succeeds.
- A rolled-back write sends no broadcast.
- The hook refetches after a simulated disconnect and ignores an out-of-order older message.
- A `DeviceNotRegistered` receipt deletes that token.

**Out of scope:** web push for iPhone, chat.

**Gate**

- [ ] Two phones and a laptop: a request created on one phone appears for the mentor on the laptop without a refresh; a claim from the laptop updates the phone
- [ ] An announcement reaches both phones as a push notification
- [ ] The staff dashboard count rises as a test check-in happens

## Phase 7: Impact reports and hardening

Phase 7 delivers the impact reports CIReN needs for grant applications and makes the platform safe to run for real: soft-delete restore, rate limits, a security review, a load test of the deadline minute, end-to-end tests, and the runbook.

**Design doc sections:** Step 1 (impact data), Step 3 (impact report sources), Step 7 (all failures, pre-event checklist).

**Build**

1. `GET /events/{id}/reports/impact` in JSON and CSV: applicants, accepted, confirmed, checked in; demographics of checked-in participants (school, level, country, gender where given); teams formed, submissions, completion rate; mentor requests and median response time.
2. `GET /orgs/{orgId}/reports/impact?from=&to=`: the same across events, plus returning participants (checked in at more than one event).
3. Organizer report page with a CSV download.
4. Soft delete and restore endpoints for events, teams, and submissions (owner only, audited). Every list and lookup excludes soft-deleted rows.
5. Rate limits on applying, joining, invite-code rotation, and mentor requests.
6. Security review, written into `docs/PROGRESS.md`: no client policies on public tables, the service-role key absent from client bundles (search the build output), tick secret and SNS checks covered by tests, no secrets in logs.
7. `scripts/loadtest.js` (k6): 80 teams saving every 30 seconds for the last 15 minutes, compressed into a run against a preview deployment, plus the lock firing.
8. Playwright end-to-end tests: apply, accept, join a team, submit, score, publish results.
9. `docs/RUNBOOK.md`: every failure in the design doc's Step 7 table with exact dashboard steps, plus the pre-event checklist.

**Tests that must pass**

- Report numbers for the seeded event match hand-counted fixture values.
- Soft-deleted rows never appear in lists, reports, or the gallery; restore brings them back.
- Load test target (proposed, adjust if needed): no errors, 95% of saves under 800 ms, and no save lost at the lock.
- The Playwright suite passes on a preview deployment.

**Out of scope:** new features.

**Gate**

- [ ] Download the impact CSV for the test event; it matches a hand count
- [ ] Delete and restore a team from the organizer screen
- [ ] Read the runbook with the Ghana-based operator; they can restore a paused project without help
- [ ] Restore drill: last night's backup restored into a fresh local database

## Phase 8: Dry run and launch

Phase 8 proves the platform with real people before a real event: a mock hackathon of 15 to 20 people from CIReN and the AWS club, every problem fixed, and the Android app moved from closed test to production.

**Design doc sections:** Step 7 (pre-event checklist, deploy freeze), Step 8 (dry run).

**Human runs the dry run**

1. Create the mock event with a short timeline: applications open for a day, a 3-hour hack window, judging the same evening.
2. Walk every role through it: apply, accept, RSVP, check in at a real door, form teams, submit, mentor requests, announcements, judging, results.
3. Log every problem as a GitHub issue labeled `dry-run`, with severity: P0 (data wrong or lost, someone blocked), P1 (confusing or slow), P2 (polish).

**Agent fixes**

4. One session per batch of issues: P0 first, then P1. Each fix comes with a test that fails before the fix.
5. Production checklist in `docs/RUNBOOK.md` updated with anything the dry run taught.

**Human launches**

6. Once 14 days of the closed test have passed with 12 or more testers, apply for Play production access.
7. Set up the real event, run the 72-hour pre-event checklist, announce the deploy freeze.

**Gate**

- [ ] The dry run finished with no data lost and every P0 closed
- [ ] The impact report for the dry run matches a hand count
- [ ] Play production access requested (or the event runs web-only)
- [ ] Pre-event checklist complete for the first real event

### After v1

- GitHub timestamp integrity check through a GitHub App (exact push times)
- Enforced multi-tenancy for other organizations
- iOS app, if CIReN pays Apple's yearly fee
- AWS OIDC federation from Vercel instead of stored keys

## Canonical schema

This is the complete v1 schema; each phase's migrations take the tables that phase names from here, unchanged. A change to this file is a design change and needs a person's approval (Agent rule 5).

```sql
-- Types
create type event_status as enum ('draft', 'published', 'live', 'judging', 'completed');
create type event_mode as enum ('in_person', 'virtual', 'hybrid');
create type staff_role as enum ('owner', 'admin', 'judge', 'mentor', 'volunteer');
create type application_status as enum ('submitted', 'accepted', 'waitlisted', 'rejected', 'confirmed', 'declined');
create type checkin_method as enum ('scan', 'manual');
create type submission_status as enum ('draft', 'submitted');
create type sha_state as enum ('none', 'pending', 'captured', 'unreachable');
create type mentor_request_status as enum ('open', 'claimed', 'resolved', 'cancelled');
create type notification_channel as enum ('email', 'push');
create type notification_status as enum ('pending', 'sending', 'sent', 'failed', 'suppressed', 'superseded');
create type suppression_reason as enum ('bounce', 'complaint');

-- Identity (Phase 1)
create table users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  name text not null default '',
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now()
);
create table profiles (
  user_id uuid primary key references users (id) on delete cascade,
  bio text, avatar_url text, github_username text,
  school text, level_of_study text, graduation_year int, country text,
  gender text,                                     -- optional
  timezone text not null default 'UTC',
  email_reminders boolean not null default true
);
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique
);
create table org_members (
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  primary key (org_id, user_id)
);
create table push_tokens (
  token text primary key,
  user_id uuid not null references users (id) on delete cascade,
  platform text not null,
  created_at timestamptz not null default now()
);
create table audit_log (
  id bigint generated always as identity primary key,
  event_id uuid,
  actor_id uuid references users (id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb, after jsonb,
  created_at timestamptz not null default now()
);
create table rate_limit_counters (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

-- Event setup and applications (Phase 2)
create table events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id),
  name text not null,
  slug text not null unique,
  description text not null default '',
  timezone text not null default 'UTC',
  mode event_mode not null,
  location text,
  applications_open_at timestamptz,
  applications_close_at timestamptz,
  starts_at timestamptz not null,
  submission_deadline timestamptz not null,
  ends_at timestamptz not null,
  team_size_min int not null default 1,
  team_size_max int not null default 4,
  max_tracks_per_submission int not null default 1,
  application_questions jsonb not null default '[]',
  status event_status not null default 'draft',
  submissions_locked_at timestamptz,
  results_snapshot jsonb,
  deleted_at timestamptz,
  check (team_size_min >= 1 and team_size_max >= team_size_min),
  check (starts_at < submission_deadline and submission_deadline <= ends_at)
);
create table event_staff (
  event_id uuid not null references events (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  role staff_role not null,
  primary key (event_id, user_id, role)
);
create table tracks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  name text not null,
  description text not null default ''
);
create table schedule_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text
);
create table rubric_criteria (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  name text not null,
  description text not null default '',
  max_score int not null check (max_score > 0),
  weight numeric not null default 1 check (weight > 0),
  position int not null default 0,
  is_tiebreaker boolean not null default false
);
create table awards (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  track_id uuid references tracks (id),            -- null for overall awards
  name text not null,
  rank int
);
create table applications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id),
  user_id uuid not null references users (id),
  answers jsonb not null default '{}',
  status application_status not null default 'submitted',
  ticket_code text unique,                          -- set on confirm
  decided_by uuid references users (id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);
create index on applications (event_id, status);

-- Notifications (Phase 2)
create table notification_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  channel notification_channel not null,
  template text not null,
  payload jsonb not null default '{}',
  dedupe_key text not null unique,
  status notification_status not null default 'pending',
  send_after timestamptz not null default now(),
  locked_until timestamptz,
  attempts int not null default 0,
  last_error text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index on notification_outbox (send_after) where status = 'pending';
create table email_suppressions (
  email text primary key,
  reason suppression_reason not null,
  created_at timestamptz not null default now()
);

-- Participation (Phase 3)
create table check_ins (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id),
  user_id uuid not null references users (id),
  checked_in_by uuid not null references users (id),
  method checkin_method not null,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);
create table teams (
  id uuid primary key,                              -- client-generated allowed
  event_id uuid not null references events (id),
  name text not null,
  invite_code text not null unique,
  owner_id uuid not null references users (id),
  looking_for_members boolean not null default false,
  looking_for text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, event_id)
);
create table team_members (
  team_id uuid not null,
  event_id uuid not null,
  user_id uuid not null references users (id),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id),
  unique (event_id, user_id),
  foreign key (team_id, event_id) references teams (id, event_id) on delete cascade
);

-- Submissions (Phase 4)
create table submissions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  team_id uuid not null unique,
  title text not null default '',
  tagline text not null default '',
  write_up text not null default '',
  github_url text, youtube_url text, demo_url text,
  status submission_status not null default 'draft',
  submitted_at timestamptz,
  auto_submitted boolean not null default false,
  below_min_size boolean not null default false,
  version int not null default 1,
  locked_commit_sha text,
  sha_status sha_state not null default 'none',
  sha_fetched_at timestamptz,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (team_id, event_id) references teams (id, event_id)
);
create index on submissions (event_id, status);
create table submission_tracks (
  submission_id uuid not null references submissions (id) on delete cascade,
  track_id uuid not null references tracks (id),
  primary key (submission_id, track_id)
);

-- Judging (Phase 5)
create table judge_assignments (
  event_id uuid not null references events (id),
  judge_id uuid not null references users (id),
  submission_id uuid not null references submissions (id),
  primary key (judge_id, submission_id)
);
create table scores (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions (id),
  judge_id uuid not null references users (id),
  criterion_id uuid not null references rubric_criteria (id),
  score numeric not null check (score >= 0),       -- <= max_score checked in the API
  comment text,
  updated_at timestamptz not null default now(),
  unique (submission_id, judge_id, criterion_id)
);
create table award_winners (
  award_id uuid not null references awards (id) on delete cascade,
  team_id uuid not null references teams (id),
  primary key (award_id, team_id)
);

-- During the event (Phase 6)
create table announcements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id),
  author_id uuid not null references users (id),
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  pushed_at timestamptz
);
create table mentor_requests (
  id uuid primary key,                              -- client-generated allowed
  event_id uuid not null references events (id),
  team_id uuid not null references teams (id),
  requested_by uuid not null references users (id),
  topic text not null,
  description text not null default '',
  status mentor_request_status not null default 'open',
  claimed_by uuid references users (id),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  resolved_at timestamptz
);
create index on mentor_requests (event_id, status);

-- Every public table: row-level security on, no client policies
-- alter table <name> enable row level security;   (repeat for each table above)
```
