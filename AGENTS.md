# AGENTS.md

Rules for every coding agent working in this repository. They apply to every phase. Copied from the "Agent rules" section of `docs/BUILD_PLAN.md`; if the two disagree, the build plan wins and this file should be fixed.

Before writing code, read this file, then `docs/PROGRESS.md`, then your phase in `docs/BUILD_PLAN.md`, then the sections of `docs/DESIGN.md` that the phase names.

Never push to GitHub. A person reviews each phase gate and pushes.

## Scope

1. Build only the current phase. Anything else you notice goes under "Later" in `docs/PROGRESS.md`.
2. When the design doc is unclear about permissions, deletion, auth, or deadlines, stop and write the question in `docs/PROGRESS.md`. Do not guess.
3. Add a dependency only when it removes real work. Record each new dependency and its reason in `docs/PROGRESS.md`.

## Database

4. Every schema change is a new file in `supabase/migrations/`. Never edit a migration that has run. Changes must be backward-compatible: add first, remove in a later release.
5. Tables, columns, and constraints come from the Canonical schema section. A change to it is a design change: write it in `docs/PROGRESS.md` for a human to approve.
6. Row-level security is enabled on every public table with no client policies. Clients never read or write tables directly; the API connects as the table owner. The only client policies are on `realtime.messages` (Phase 6).
7. Deadline-sensitive writes (submission save, submit, team join, leave, remove) start with `SELECT ... FROM events WHERE id = $1 FOR SHARE` and reject with `SUBMISSION_LOCKED` if `submissions_locked_at` is set or `now() >= submission_deadline`.
8. Lock order is always: event row, then team row, then anything else.
9. Never make a network call (GitHub, SES, Expo) inside a database transaction.
10. Rules that depend on time use the database's `now()`, never the client's clock.

## API

11. Every endpoint lives under `apps/web/app/api/v1/` and uses the shared `handler()` wrapper: auth, role check, Zod validation, error mapping, and the `server_time` header.
12. Request and response shapes are Zod schemas in `packages/shared`. Web and mobile import the same schemas.
13. Errors use the one shape and the codes in `packages/shared/src/errors.ts`. Add a code there before using it.
14. Creates from the mobile app accept a client-generated UUID `id`. Insert with `ON CONFLICT (id) DO NOTHING` and return the existing row, so a retry is harmless.
15. Write an `audit_log` row for: status changes, application decisions, manual check-ins, member removals, scores, awards, reopening submissions, deletes and restores.
16. Notifications are rows in `notification_outbox`, written in the same transaction as the change. Never send email or push from a request handler.

## Security

17. The Supabase service-role key, database URL, AWS keys, GitHub token, and tick secret exist only in server environment variables. Never import them in client code. Never log them, or full email addresses.
18. Internal endpoints check their secret (`/api/internal/tick`) or the SNS message signature (`/api/internal/ses-events`) before doing anything.

## Tests and done

19. Pure logic (state transitions, standings, assignment, invite codes) has unit tests with fixed inputs. Every endpoint has an integration test against the local Supabase database, including one test per role that must be refused.
20. Concurrency tests named in a phase run real parallel requests against Postgres. They must pass every run, not most runs.
21. A phase is done when: migrations apply cleanly to an empty database, `pnpm lint && pnpm typecheck && pnpm test` pass, the app deploys, and `docs/PROGRESS.md` is updated.

## Style

22. TypeScript strict mode, no `any`. Small functions. Names from the design doc (`submissions_locked_at`, not `isLocked`).
23. Times are stored and sent in UTC ISO 8601; the UI converts to the user's chosen timezone.

## Design

UI follows the HackXperience design foundations (`HackXperience screens.pdf`, page 1): a neumorphic surface `#E6EBF1`, raised shapes for things you tap or that hold content, inset shapes for inputs and selected states, one light source from the top left. Only the primary button is a solid CIReN green (`#046E00`) fill. Bright green `#40B830` is for focus rings and accents on dark surfaces, never text on a light surface. Status is always a dot or icon plus a word. Inter Tight for headings, Inter for body, JetBrains Mono for codes, times, hashes, scores and live counts. Tokens live in `apps/web/app/globals.css` and `apps/mobile/src/theme.ts`.
