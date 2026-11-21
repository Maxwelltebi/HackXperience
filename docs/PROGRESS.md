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
| Q14 | **Check-in window.** Scanning works while the event is published or live; refused once judging starts. OK?                                                                                                                                                                                      | P3     | —                 | Published or live                      |        |
| Q15 | **Team board privacy.** The board shows each open team's member names and schools to confirmed participants (never invite codes). OK to show schools?                                                                                                                                           | P3     | —                 | Names and schools                      |        |
| Q16 | **Play closed test timing.** The build plan starts the Android closed test in Phase 3, so its 14 days run while the web is built. Going web-first delays that clock. Start a minimal Android build early anyway, just to begin the 14 days?                                                     | P3     | Play production   | Not started                            |        |
| Q17 | **Reopening past the event end** _(deadlines)_. The events table requires `submission_deadline <= ends_at`, so reopen refuses a new deadline after the event ends. Should reopen move `ends_at` too?                                                                                            | P4     | —                 | Refused: change the end time first     |        |
| Q18 | **When reopen is allowed** _(deadlines)_. Only while the event is published or live, never once judging has started. OK?                                                                                                                                                                        | P4     | —                 | Published or live                      |        |
| Q19 | **Who gets deadline reminders.** The plan says "teams with an unsubmitted draft". Teams that never saved anything get them too, since they need them most. OK?                                                                                                                                  | P4     | —                 | Every team that hasn't submitted       |        |
| Q20 | **Private GitHub repos.** DESIGN Step 4 says GitHub links must be public; the build plan's link check is format only. Today a private repo shows up after the deadline as "Couldn't read the repository" (`sha_status = unreachable`). Also check at save time (one GitHub call per save)?      | P4     | —                 | Format check only                      |        |
| Q21 | **Full ranking in public?** Public results show awards and their winners only. The full ranking is kept in the snapshot for organizers. Publish the whole ranking too?                                                                                                                          | P5     | —                 | Winners only                           |        |
| Q22 | **Publishing with missing scores.** "Mark completed" works even if some judges haven't finished; the judging page shows "N of M scores in" first. Block it instead?                                                                                                                             | P5     | —                 | Allowed, progress shown                |        |
| Q23 | **Do judges see team names?** Judges see the team name with each project (not blind judging). OK?                                                                                                                                                                                               | P5     | —                 | Team names shown                       |        |
| Q24 | **Mentor request limits.** A team may have 3 open or claimed requests at once, and requests are taken only while the event is live. OK?                                                                                                                                                         | P6     | —                 | 3, live only                           |        |
| Q25 | **Who gets announcement pushes.** Every confirmed participant and every staff member with the Android app. Should staff be left out?                                                                                                                                                            | P6     | —                 | Participants and staff                 |        |
| Q27 | **Members of a deleted team.** They stay attached, so restoring is exact; until it's restored they can't join another team. OK, or should deleting a team free its members? _(deletion)_                                                                                                        | P7     | —                 | Members stay attached                  |        |
| Q28 | **"Accepted" in the impact report** counts everyone offered a place (accepted, confirmed or declined). OK for grant reports?                                                                                                                                                                    | P7     | —                 | Offered a place                        |        |
| Q8  | Real CIReN event sizes, to recheck the DESIGN Step 2 estimates.                                                                                                                                                                                                                                 | Design | Phase 7 load test | 500 applicants, 300 accepted, 80 teams |        |

### Resolved

| ID  | Question                                                                                       | Resolution                                                                                                                                                                                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Design doc missing                                                                             | Added 19 Nov 2026; copied to `docs/DESIGN.md`.                                                                                                                                                                                                                                                                                                                 |
| R2  | Header name `server_time` vs `Server-Time`                                                     | DESIGN Step 4 says `server_time`. Kept.                                                                                                                                                                                                                                                                                                                        |
| R3  | Error code names                                                                               | DESIGN only fixes the shape and the domain codes (`TEAM_FULL`, `STALE_VERSION`, …). The generic codes stay.                                                                                                                                                                                                                                                    |
| R4  | Should the public profile require sign-in?                                                     | No: DESIGN Step 4 says "anyone". School is still open (Q2).                                                                                                                                                                                                                                                                                                    |
| R5  | Error `details` shape                                                                          | DESIGN Step 4 shows `"details": {}`. Changed from an array to an object; validation problems are under `details.fields` as `{ "path": "message" }`.                                                                                                                                                                                                            |
| R6  | `DELETE /me/push-tokens` body vs path                                                          | DESIGN Step 4: `DELETE /me/push-tokens/{token}`. Changed.                                                                                                                                                                                                                                                                                                      |
| R8  | Applying twice                                                                                 | Returns the first application (`200`) instead of an error, so a mobile retry is harmless (Agent rule 14).                                                                                                                                                                                                                                                      |
| R9  | Tick lock with a transaction-mode pooler                                                       | `pg_try_advisory_xact_lock`, not the session lock the build plan names: through Supavisor in transaction mode a session lock can stick to a pooled connection forever. See `packages/db/src/tick.ts`.                                                                                                                                                          |
| R10 | Rate-limit helper location                                                                     | The build plan puts it in `packages/core`, but it reads and writes `rate_limit_counters`, so it lives in `packages/db` (`hitRateLimit`). It runs outside the protected transaction, so failed attempts still count.                                                                                                                                            |
| R11 | Team name and board fields                                                                     | DESIGN has no endpoint to set `looking_for_members` / `looking_for`. Added `PATCH /events/{id}/teams/me` (any member), needed for the find-a-team board.                                                                                                                                                                                                       |
| R12 | Creating a team after the deadline                                                             | Treated as deadline-sensitive like joining (`SUBMISSION_LOCKED`).                                                                                                                                                                                                                                                                                              |
| R13 | Submission before the first save                                                               | No row exists until the first save: GET returns a blank draft with `id: null, version: 0`, and the first PUT sends `If-Match: 0`. Two teammates' first saves race on the team row lock; the second gets `STALE_VERSION`.                                                                                                                                       |
| R14 | Does Submit change the version?                                                                | No. `version` counts content edits; Submit only sets the status, so a teammate's open editor isn't made stale by it.                                                                                                                                                                                                                                           |
| R15 | Which commit is "locked"                                                                       | The latest commit on the default branch when the tick fetches it (within about a minute of the lock), as the build plan says. Exact capture needs a GitHub App (DESIGN, deferred).                                                                                                                                                                             |
| R16 | New error codes                                                                                | `STALE_VERSION` (409, `details.current` holds the saved version) and `TEAM_TOO_SMALL` (409, Submit below `team_size_min`).                                                                                                                                                                                                                                     |
| R17 | Judging from unlocked submissions                                                              | Starting judging runs the deadline lock in the same transaction, so judging never starts from unlocked submissions, even when the tick hasn't run (as on a laptop).                                                                                                                                                                                            |
| R18 | Re-running assignment                                                                          | Allowed while judging. Assignments that have scores are kept; the rest are recomputed and topped up to N. The seed is returned and audited, so a run can be replayed.                                                                                                                                                                                          |
| R19 | What freezes when                                                                              | The rubric is frozen once judging starts (scores depend on it). Award winners can be chosen only while judging. Awards and winners are frozen at completion (badges depend on them).                                                                                                                                                                           |
| R20 | Badges before publication                                                                      | Badges show only for completed events, so winners don't leak before results are out.                                                                                                                                                                                                                                                                           |
| R21 | Team feedback endpoint                                                                         | DESIGN says teams see anonymized judge comments but names no endpoint. Added `GET /events/{id}/teams/me/feedback`. Judges appear as "Judge 1", "Judge 2", ordered by a hash, never by name.                                                                                                                                                                    |
| R22 | New codes and permissions                                                                      | Codes `JUDGING_CLOSED` (423), `RESULTS_NOT_PUBLISHED` (404) and `RESULTS_PUBLISHED` (409). Permissions `judging.manage` and `submissions.read_all` (owner, admin).                                                                                                                                                                                             |
| R23 | Spread in the z-score                                                                          | Population standard deviation. It reproduces the design doc's example exactly.                                                                                                                                                                                                                                                                                 |
| R24 | Where push tickets live                                                                        | The schema has no ticket table, and adding one is a design change. Expo tickets are kept on the outbox row (`payload.tickets`, each with its token), and `payload.receipts_checked` marks rows whose receipts were read.                                                                                                                                       |
| R25 | Broadcast mechanism                                                                            | Supabase's `realtime.send()` inside the write's transaction. The message is a row in `realtime.messages`, so a rolled-back write sends nothing (tested).                                                                                                                                                                                                       |
| R26 | Hint versions                                                                                  | `version` is the database clock in milliseconds at the change. Lists return the version they were read at, and the client ignores hints that aren't newer. The teammate-saved hint carries the submission's own `version`.                                                                                                                                     |
| R27 | Channel helper functions                                                                       | They live in a `hx_private` schema that the Data API doesn't expose, so nobody can call them over HTTP to find out who is staff where. Only `can_receive` is executable by `authenticated`, for the policy.                                                                                                                                                    |
| R28 | Extra endpoints                                                                                | `GET /events/{id}/teams/me/mentor-requests` (a team sees its own requests) and `GET /events/{id}/live-stats` (the dashboard's first load and its reconnects). DESIGN names neither.                                                                                                                                                                            |
| R29 | Report scope                                                                                   | Demographics count checked-in participants only. Blank answers are "Not given". Completion rate is submitted projects over teams with members. Median response is from asking to a mentor claiming. Soft-deleted teams and projects never count.                                                                                                               |
| R30 | Org report range                                                                               | `from` and `to` are dates (inclusive, UTC) on the event start. Drafts are excluded.                                                                                                                                                                                                                                                                            |
| R31 | CSV safety                                                                                     | Cells that start with `=`, `+`, `-` or `@` get a leading apostrophe, because school names come from applicants (CSV injection). A UTF-8 byte-order mark makes Excel read accents correctly.                                                                                                                                                                    |
| R32 | End-to-end sign-in (Q26)                                                                       | Answered 21 Nov 2026: option 1. Playwright signs in four email-and-password test accounts that exist only on the dev Supabase project. The app has no password form and no test-login route; the suite writes the same session cookie the app reads. Production keeps the Email provider **off**, and the suite stops before touching data if it finds it off. |
| R33 | Event status badges (Q29)                                                                      | Answered 21 Nov 2026: keep the previous structure. The badge follows the event's `status`, which organizers move with Go live, Start judging and Mark completed. Only Upcoming and Applications open come from the application dates. The screens PDF's rule that status "comes from the clock" does not apply.                                                |
| R7  | Retry-safe creates: body `id` (build plan rule 14) vs `Idempotency-Key` header (DESIGN Step 4) | `handler({ clientId: true })` accepts either; if both are sent they must match.                                                                                                                                                                                                                                                                                |

---

## Mobile app status

The Android app is paused while the web app is finished (the web app covers every role on phones; DESIGN Step 8 cut line). This log is what a person or agent needs to pick it back up.

| Area                                                                                                                                                  | State                                                                                                                                                     | Where                                          | Next step                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------- |
| App shell, Expo SDK 58, Expo Router                                                                                                                   | Done                                                                                                                                                      | `apps/mobile/src/app/_layout.tsx`              | —                                                                                |
| Package `network.ciren.hackxperience`, scheme `hackxperience`                                                                                         | Done (the package is fixed after the first Play upload)                                                                                                   | `apps/mobile/app.json`                         | —                                                                                |
| Google and GitHub sign-in (PKCE, in-app browser, deep link)                                                                                           | Built, **not yet tried on a device** (needs Supabase OAuth set up)                                                                                        | `src/lib/auth.tsx`, `src/lib/auth-redirect.ts` | Phase 1 gate: sign in on Android in development                                  |
| Session storage                                                                                                                                       | AsyncStorage                                                                                                                                              | `src/lib/supabase.ts`                          | —                                                                                |
| API client: bearer token, error shape, `server_time` offset                                                                                           | Done                                                                                                                                                      | `src/lib/api.ts` (`serverNow()`)               | Add calls per phase                                                              |
| Profile screen: name, school, GitHub, time zone, email reminders                                                                                      | Done                                                                                                                                                      | `src/app/index.tsx`                            | Add bio, level, graduation year, country, gender to match the web                |
| Design tokens (colors, raised and inset shadows, 52 px controls)                                                                                      | **Outdated**: still the old soft look; the web moved to the CIReN style on 21 Nov 2026                                                                    | `src/theme.ts`, `src/components/ui.tsx`        | —                                                                                |
| Fonts (Inter, Inter Tight, JetBrains Mono)                                                                                                            | Not started; system font                                                                                                                                  | —                                              | Load with `expo-font` before the Phase 3 screens                                 |
| App icon, splash artwork                                                                                                                              | Not started                                                                                                                                               | —                                              | Needed before the first Play upload                                              |
| Unit tests                                                                                                                                            | 4 (redirect parsing)                                                                                                                                      | `src/lib/auth-redirect.test.ts`                | —                                                                                |
| Bundle check                                                                                                                                          | `expo export --platform android` passes                                                                                                                   | —                                              | Run before each build                                                            |
| **Phase 3:** events list, event page, ticket QR, my team (create, join by code, leave), volunteer scanner; EAS build profile; first closed-test build | Not started (deferred: web first). The API is ready: `/me/ticket`, `/teams/*`, `/check-ins/*`                                                             | —                                              | The Play closed test needs 14 days with 12+ testers before production (see Q16)  |
| **Phase 4:** countdown using the `server_time` offset (build plan item 9)                                                                             | Not started (deferred: web first). `serverNow()` in `src/lib/api.ts` already tracks the offset; the submission API is ready                               | —                                              | No submission editor on mobile is planned; the web editor works on phones        |
| **Phase 5:** judge scoring screen                                                                                                                     | Not started (deferred: web first). The API is ready: `/judging/me`, `/submissions/{sid}`, `/submissions/{sid}/scores/me`                                  | —                                              | The web scoring page works on phones in the meantime                             |
| **Phase 6:** push token registration (after sign-in and on change), announcements feed, mentor request form, `useLiveChannel`                         | Not started (deferred: web first). The server side is ready: the push sender, receipts, `POST /me/push-tokens`, and the shared `LiveSync` reconnect rules | —                                              | Push needs the Expo access token and FCM credentials (human task before Phase 6) |

Phase 2 added nothing on mobile. `/me` now also returns `event_roles` and `org_ids`; the app parses them through the shared schema.

Known gaps: the time zone field is free text (validated by the API), not a picker; the mobile profile shows fewer fields than the web.

---

## UI redesign: CIReN style (web; 21 Nov 2026)

The screens PDF was redrawn in CIReN's own style, replacing the soft neumorphic look. The web app now follows it.

### Status

| Check                                   | Result                                                                                                                                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint && pnpm typecheck`           | Passed                                                                                                                                                                                                        |
| Web unit tests                          | Passed, with 11 new ones in `apps/web/tests/ui.test.ts` (badge words, initials, countdown). The 13 database integration tests weren't run: the local Supabase database wasn't running (machine low on memory) |
| Looked at in a browser, 390 and 1440 px | **Not yet**: review on the Vercel deployment (Foundations rule 09)                                                                                                                                            |
| End-to-end suite                        | Not run. Its button names and labels are unchanged                                                                                                                                                            |

### What was built

- **Tokens and shared parts** (`apps/web/app/globals.css`): the PDF's colors (forest, CIReN green, bright green, mint, hero, section and mint tints, Night, ink, muted, line, line strong); panels, frames, dark bands, wells; buttons (primary, secondary, arrow, reject, disabled, small, on dark); inputs with labels above, focus and error states, toggle chips; square status badges; underline tabs; tables with a tinted header; stat strip, meter, avatar, bulk bar, sticky save bar. The old class names `raised` and `inset` became `panel` and `well` everywhere.
- **Status words** follow the PDF: Upcoming, Applications open, Live now (solid, with a dot), Judging, Ended (`lib/ui/event-phase.ts`, `lib/ui/status.ts`). Which badge shows still follows the event's status, not the clock (R33).
- **Screens rebuilt to match the PDF:**
  - Header and footer: white header with Events, How to Participate, For organizers; Night footer with link columns.
  - Homepage: hero band with the framed Enter-key image, the next event in the dark band with its dates, past events as framed cards, How to participate, For organizers, Get started.
  - Sign-in: hero tint, the headline, the framed sign-in card.
  - Event page: dark header band with dates, venue, format and team size; tabs; About, Schedule (table), Tracks, How projects are judged (rubric with weights as percentages); the framed apply box with a days, hours and minutes countdown; a dark submission countdown for confirmed participants; team with avatars and the invite code.
  - Organizer shell: dark sidebar with the brand, event, sections and the signed-in person; a white page head with the event name and status badge on every organizer page.
  - Applications: tabs with counts in the page head, search, the dark bulk bar, the table, the side panel. Times in the table carry the zone in the column heading.
  - Judging: stat strip (scores in, judges still scoring, projects and ties), standings with tracks, judges, raw average, adjusted score (signed) and awards won, then how adjusted scores work and a box for each tie with its tiebreaker values.
  - Submission editor: one column, a dark strip with the deadline and countdown, links grouped as optional, tracks as toggle chips, a sticky save bar.
  - Check-in scanner: count with a progress bar, dark camera area with bright green corners, a framed result.
- Every other screen picks up the new look through the shared classes.
- **Hero image**: cropped from page 2 of the screens PDF into `apps/web/public/images/hero-enter-key.jpg` (62 KB). Confirm CIReN may use this image on the live site.
- Favicon redrawn as the forest square with a white H and bright green X.

### Left out, and why

- **Export CSV** and the **School** filter on Applications: there's no export endpoint, and the list API searches by name, email and school but doesn't filter by school.
- **"Email me when it opens"** and **"Get the Android app"** on the homepage: neither exists yet. The hero no longer says the platform works on Android.
- **"Organized by" and "Who can apply"** panels on the event page: events have no fields for them.
- **Policies** column in the footer (Code of conduct, Privacy): the pages don't exist yet (Q6).
- **Past event photos**: there are no photos to show; the past-event cards show the name, date and a link to the projects.
- **"Reassign judges" and "Publish results"** in the standings head: assigning stays in the Judges panel, and results are still published from the Overview with Mark completed (Q22).
- **"Show times in"** on the schedule: times use the profile's time zone, with a Change link.
- **"Public repository found"** live check under the GitHub field: links are checked for format only (Q20).
- The phone participant home (PDF page 8) is an Android screen. On the web, the same items are in the event page's side column.

---

## Phase 7: Impact reports and hardening (web; built 21 Nov 2026, gate not yet run)

### Status

| Check                                      | Result                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `pnpm lint && pnpm typecheck && pnpm test` | Passed: 419 tests                                                                                             |
| Report numbers match a hand count          | Yes: `packages/db/src/reports.int.test.ts` builds a fixture with known answers                                |
| Load test (k6)                             | **Script written, not run**: needs a preview deployment and 80 test accounts (`docs/RUNBOOK.md`, "Load test") |
| Playwright end-to-end suite                | **Built, not yet run**: `apps/web/e2e`. Needs the four test accounts (README, "End-to-end tests")             |
| Restore drill                              | **Not done**: needs the nightly backup secrets and a local database with `psql`                               |

### What was built

- **Impact reports** (`packages/db/reports.ts`):
  - `GET /events/{id}/reports/impact?format=json|csv` (owner, admin):
    - applicants, offered a place, confirmed, checked in;
    - demographics of checked-in participants (school, level, country, gender; blank is "Not given");
    - teams, submissions and completion rate;
    - mentor requests, how many were resolved, and the median minutes to a mentor.
  - `GET /orgs/{orgId}/reports/impact?from=&to=&format=` (org members): the same per event, plus "All events" totals and returning participants (checked in at more than one event).
  - `toCsv` in core: RFC 4180, injection-safe.
- **Organizer screens**:
  - **Impact report**, with **Download CSV**.
  - **Teams**: every team with its members and project, and owners can delete or restore a team or its project.
  - Overview: **Delete event** (owner). The Organize list shows **Deleted events** with **Restore**.
- **Soft delete and restore** for events, teams and submissions:
  - Owner only, audited (`*.deleted` and `*.restored`).
  - `DELETE /events/{id}` and `POST /events/{id}/restore`.
  - `DELETE /events/{id}/teams/{tid}` and `POST …/teams/{tid}/restore`.
  - `DELETE /events/{id}/submissions/{sid}` and `POST …/submissions/{sid}/restore`.
  - A deleted team's project leaves standings, judging queues, the gallery, live counts and reports.
- **Rate limits** per person per minute: applying 5, joining a team 10 (Phase 3), new invite code 5, mentor requests 5.
- **`docs/RUNBOOK.md`**: every failure in DESIGN Step 7 with plain dashboard steps, the 72-hour checklist, and how to run the load test.
- **End-to-end suite** (`apps/web/e2e`, added 21 Nov 2026 after Q26; run with `pnpm e2e`):
  - One journey with four people in four browsers. Alice and Bob apply, the organizer accepts both, and they confirm. The organizer goes live. Alice starts a team and Bob joins with the invite code. Alice saves and submits. The organizer starts judging and assigns the judge, who scores. The organizer picks the award winner and marks the event completed. A signed-out visitor then sees the winner on the results page and the project in the gallery.
  - Sign-in (R32): `global-setup.ts` signs each account in with its password through `@supabase/ssr` and saves the cookie as a Playwright storage state. It first checks the project's public auth settings and stops if Email sign-in is off, so it can't run against production.
  - The database is used only to prepare the event (rubric, award, judge on staff), to move the submission deadline into the past instead of waiting, and to delete everything afterwards. An interrupted run's event is removed at the start of the next one.
  - With `SUPABASE_SERVICE_ROLE_KEY` in `apps/web/.env.local`, the setup creates the accounts itself. Otherwise they're made once by hand in the dashboard.
  - Not part of `pnpm test` or CI: it needs a running app and the dev project. Against a preview deployment, set `E2E_BASE_URL`.
- **`scripts/loadtest.js`**: k6, 80 teams saving every 3 seconds for 90 seconds (the last 15 minutes compressed). The deadline lands inside the run. Thresholds: p95 under 800 ms and no unexpected answers.

### Security review (21 Nov 2026)

| Check                                                          | Result                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No client policies on public tables; RLS on every public table | **Pass**, and now a standing test (`packages/db/src/security.int.test.ts`). The only client policy is the one on `realtime.messages` (Phase 6)                                                                                                                                                                                            |
| Channel helpers unreachable anonymously                        | **Pass**: `hx_private` isn't exposed by the Data API, and `anon` has no usage on it (tested)                                                                                                                                                                                                                                              |
| Service-role key and other secrets absent from client code     | **Pass at source level**: no `'use client'` file reads anything but `NEXT_PUBLIC_*` variables. Secrets are read only in `lib/server/*` and internal routes, and every `lib/server` module now imports `server-only` (three didn't before). The plan's check of the _build output_ still needs a `next build`, which is not run on this PC |
| Tick secret and SNS signature checks covered by tests          | **Pass**: `apps/web/tests/internal.int.test.ts` covers a wrong or missing secret, bad signatures, untrusted certificate hosts, the wrong topic, and old messages                                                                                                                                                                          |
| No secrets or email addresses in logs                          | **Pass**: the API logs only the method, path and database error code. Outbox errors have email addresses removed (`describeError`). Push receipts log the same cleaned text                                                                                                                                                               |
| Test sign-in can't reach production                            | **Pass**: `Bearer test:<id>` exists only in the vitest setup file, never in app code. The Playwright accounts (R32) use Email sign-in, which is off in production                                                                                                                                                                         |

### New dependencies

| Dependency                | Where    | Why                                                         |
| ------------------------- | -------- | ----------------------------------------------------------- |
| `@playwright/test` 1.65.1 | web, dev | The end-to-end suite named in the build plan (Phase 7 gate) |

### Left out, and why

- **Playwright suite**: built, but not run yet, because the test accounts don't exist yet. Only one journey so far. Live updates (announcements, mentor queue) and the check-in scanner (camera) aren't covered in the browser; their API tests are.
- **Load test run and restore drill**: need a preview deployment, test accounts and backup secrets (human tasks below).

### Human tasks for the Phase 7 gate

- [ ] Run `pnpm exec supabase db push --remote` (adds 0007 to 0009 if not done yet).
- [ ] Download the impact CSV for a test event and compare it with a hand count.
- [ ] Delete and restore a team from **Organize** → **Teams**.
- [ ] Read `docs/RUNBOOK.md` with the Ghana-based operator.
- [ ] Restore drill: last night's backup into a fresh local database with `scripts/restore.sh`.
- [ ] Load test on a preview deployment.
- [ ] End-to-end suite: create the four test accounts and run `pnpm e2e` (README, "End-to-end tests").
- [ ] **Production Supabase: switch the Email provider off** (Authentication → Sign In / Providers → Email). Supabase turns it on for new projects. Left on, anyone could make a password account through the API, which skips Google and GitHub sign-in.

---

## Phase 6: Live features (web; built 21 Nov 2026, gate not yet run)

### Status

| Check                                      | Result                                                                                                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migrations 0008 and 0009 apply cleanly     | Passed locally. The local stub gained `auth.uid()` and a minimal `realtime` schema, so the policy tests run without Docker. CI checks them on the real Supabase image |
| `pnpm lint && pnpm typecheck && pnpm test` | Passed: 404 tests (the mentor claim race ran 10 rounds)                                                                                                               |
| Realtime in a browser                      | **Not checked**: needs the dev project and two signed-in browsers                                                                                                     |

### What was built

- **Migration `0008_live`**: `announcements` and `mentor_requests` (client-generated id), as in the canonical schema.
- **Migration `0009_realtime_policies`**:
  - `hx_private.is_event_staff`, `is_team_member`, `is_event_participant` and `can_receive(topic, user)`.
  - One select policy on `realtime.messages` for `authenticated`. It admits each channel in the DESIGN table only to its subscribers.
  - There is no insert policy, so clients can't send.
- **Broadcasts** (`packages/db/live.ts`): `broadcast()` calls `realtime.send` inside the write's transaction. Hints go out from:
  - announcements;
  - mentor requests (created, claimed, resolved, cancelled), to the mentors' and the team's channels;
  - team join, leave and remove, to the team channel;
  - submission saves and submit (the teammate-saved notice);
  - judge assignment, to `user:{id}`;
  - staff counts, as numbers, after check-ins, first saves and submits, scores, assignments and mentor changes.
- **Push** (`packages/db/push.ts`):
  - Expo batches of 100. Tickets are kept on the outbox row, and a ticket that says DeviceNotRegistered deletes its token at once.
  - Tick step: receipts for pushes at least 15 minutes old. DeviceNotRegistered deletes the token.
  - The sender is `apps/web/lib/server/expo.ts`. `EXPO_ACCESS_TOKEN` is optional.
- **Announcements**: create (owner or admin, retry-safe) queues a push per recipient with the app; the list supports `since`.
- **Mentor queue**:
  - Create: a team member, while the event is live, at most 3 active per team.
  - List: mentors, admins and owners.
  - Claim is one conditional `UPDATE … WHERE status = 'open'`; the loser gets `ALREADY_CLAIMED`.
  - Resolve: the claimer. Cancel: the team.
- **Shared `LiveSync`** (`packages/shared/live.ts`): subscribe, then fetch; refetch on every reconnect; ignore hints that aren't newer; poll every 30 seconds while the channel is down. Mobile will reuse it.
- **Web hook** `useLiveChannel(topic, refetch, onHint?)` on Supabase private channels. Without Supabase configured, it polls.
- **Screens**:
  - The organizer sidebar gains **Live dashboard** (live counters), **Announcements** (composer and feed) and **Mentor queue** (claim and resolve).
  - Event page: a live announcements feed for staff and confirmed participants.
  - Team page: **Ask a mentor**, with the team's requests updating live.
  - Submission editor: "A teammate saved a newer version", with **Load it** or **Compare** (Compare opens the conflict screen).

**Tests the plan requires, all present:**

- A participant can't receive `event:{id}:staff` or another team's channel. This is checked against the real RLS policy by switching to the `authenticated` role with JWT claims, and covers every channel type.
- Two mentors claiming at the same moment: exactly one succeeds, in 10 rounds.
- A rolled-back write sends no broadcast.
- `LiveSync` refetches after a simulated disconnect and ignores an out-of-order older hint.
- A DeviceNotRegistered receipt deletes that token.
- API refusals for every role on every live endpoint.

### Left out, and why

- **Mobile push registration, the feed and the request form**: web first (Mobile app status table). The server is ready.
- **Push for other notifications** (decisions, reminders, results): only announcements push in this phase, as the build plan lists. The others are ready to add as outbox templates.
- **Web push for iPhone, chat**: out of scope in the plan.

### Human tasks for the Phase 6 gate

- [ ] Run `pnpm exec supabase db push --remote`, which adds 0007 to 0009.
- [ ] Expo access token and FCM credentials (before the Android app work resumes).
- [ ] Gate: two browsers signed in as a team member and a mentor. The request appears for the mentor without a refresh, and the claim updates the team's page. The staff dashboard count rises on a test check-in.

---

## Phase 5: Judging and results (web; built 21 Nov 2026, gate not yet run)

### Status

| Check                                          | Result                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Migration 0007 applies cleanly after 0001–0006 | Passed locally; CI checks it on the real Supabase image                                                       |
| `pnpm lint && pnpm typecheck && pnpm test`     | Passed: 386 tests                                                                                             |
| `next build`                                   | Not run (RAM on the dev PC); Vercel runs it                                                                   |
| Screens in a browser                           | **Not checked**: run `pnpm exec supabase db push --remote` first to add the judging tables to the dev project |

### What was built

- **Migration `0007_judging`**: `judge_assignments`, `scores` and `award_winners`, as in the canonical schema, plus lookup indexes.
- **`packages/core/judging.ts`**:
  - `assignJudges` follows the plan exactly: seeded shuffle, fewest assignments first, random ties, conflicts skipped. It also keeps scored assignments fixed and reports projects that are short of judges.
  - `computeStandings`:
    - weighted totals from 0 to 100;
    - a z-score per judge;
    - the pooled mean and spread for judges with fewer than 4 scores or no spread;
    - the average z per project;
    - overall and per-track ranks, with the tiebreaker criterion first and then a reported tie;
    - progress.
- **`packages/db/judging.ts`**:
  - assignment;
  - a judge's queue;
  - the submission view for judges and organizers;
  - scoring, with every criterion at once, each within `max_score`, under an event FOR SHARE lock, audited;
  - standings;
  - award winners, where a track award needs a project in that track (audited);
  - the results snapshot;
  - results;
  - the gallery, with a cursor;
  - anonymized feedback.
- **Other database changes**:
  - Status changes: starting judging locks submissions. Completing saves `results_snapshot` (awards, winners and the standings) in the same transaction and writes `results.published` to the audit log.
  - Public profiles return badges for completed events.
- **API**

  | Endpoint                                                          | Who                                             |
  | ----------------------------------------------------------------- | ----------------------------------------------- |
  | `POST /events/{id}/judging/assign` {judges_per_submission, seed?} | owner, admin; while judging                     |
  | `GET /events/{id}/judging/me`                                     | judge                                           |
  | `GET /events/{id}/submissions/{sid}`                              | assigned judge (others 404), owner, admin       |
  | `PUT /events/{id}/submissions/{sid}/scores/me`                    | assigned judge; while judging                   |
  | `GET /events/{id}/judging/standings[?published=true]`             | owner, admin                                    |
  | `POST /events/{id}/awards/{aid}/winners` {team_ids}               | owner, admin; while judging                     |
  | `GET /events/{id}/results`                                        | anyone, once completed                          |
  | `GET /events/{id}/submissions?cursor=`                            | owner and admin any time; anyone once completed |
  | `GET /events/{id}/teams/me/feedback`                              | team member, once completed                     |

- **Web UI**
  - **Organizer sidebar → Judging**:
    - Judges get their queue, each project marked To score or Scored, and a scoring page: the project with its write-up, links and captured commit, next to the rubric form with a comment box per criterion and a Next project link.
    - Owners and admins get:
      - Assign or Rebalance;
      - per-judge progress (mean, spread, and whether that judge is normalized against their own scores or all judges' scores);
      - the standings, raw and normalized side by side, with Overall and per-track tabs;
      - a winner picker for each award.
  - **Public pages**:
    - `/events/[slug]/results`: winners with member links;
    - `/events/[slug]/gallery` and `/gallery/[sid]`: projects with their write-up and award chips;
    - `/users/[id]`: a public profile with badges.
  - **Event page**: a "Results are out" card. Team members' submission page shows judge feedback.

**Tests the plan requires, all present:**

- **Core:**
  - the design doc's case: a generous judge's 9 (mean 8.5, spread 0.5) ranks below a harsh judge's 6 (mean 4.5, spread 1.0);
  - the fallback for a judge with 3 scores, and for a judge with identical scores;
  - the tiebreaker, and an exact tie reported as a tie;
  - assignment: exactly N judges, loads within 1, no conflicts, and the same seed giving the same result.
- **Database (`judging.int.test.ts`):**
  - a judge can't read an unassigned submission;
  - a judge can't score once results are out;
  - a direct database edit to scores after publication doesn't change the published results or standings.
- **API (`apps/web/tests/judging.int.test.ts`):** a refusal for every role on every endpoint.

### How to try it

1. Run `pnpm exec supabase db push --remote`, then restart `pnpm dev`.
2. Set up a demo event:
   - add rubric criteria and awards under **Tracks and schedule**;
   - add judges under **Staff** (each must have signed in once);
   - after the deadline, use the Overview's status card: **Go live**, then **Start judging**.
3. Open **Judging** and **Assign judges**. Each judge then scores from their own queue.
4. Pick winners, then **Mark completed** on the Overview. The results, gallery and badges go public.

### Left out, and why

- **Judge scoring screen on Android**: web first (Mobile app status table).
- **Live judging progress**: out of scope in the plan. The page shows progress when loaded.

---

## Phase 4: Submissions and the deadline lock (web; built 21 Nov 2026, gate not yet run)

### Status

| Check                                           | Result                                                                                                                           |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Migration 0006 applies cleanly after 0001–0005  | Passed locally (`pnpm db:local reset`); CI checks it on the real Supabase image                                                  |
| `pnpm lint && pnpm typecheck && pnpm test`      | Passed: 351 tests                                                                                                                |
| Concurrency tests (Agent rule 20)               | 50 saves around the deadline, two simultaneous locks, two teammates saving one version (10 rounds): passed in four separate runs |
| New page compiles in the dev server             | Yes (`/events/[slug]/submission`)                                                                                                |
| `next build`                                    | **Not run**: the dev PC is short of RAM. Vercel runs it on deploy                                                                |
| Editor, conflict screen and reopen in a browser | **Not checked**: needs migration 0006 on the dev Supabase project (below)                                                        |

### What was built

- **Migration `0006_submissions`**: `submissions` and `submission_tracks` exactly as the canonical schema, plus indexes on `(event_id, status)`, pending hashes, and `submission_tracks (track_id)`.
- **`packages/shared`**:
  - Link checks in `links.ts`, shared so the mobile app can reuse them:
    - GitHub links must name `github.com/{owner}/{repo}` and are stored as `https://github.com/owner/repo`, with `/tree/...` and `.git` dropped.
    - YouTube links must be on youtube.com or youtu.be.
    - Demo links must be https.
  - The link checks avoid the `URL` class because React Native's is incomplete.
  - Submission schemas (`saveSubmissionBodySchema`, `submissionSchema`, reopen).
  - Error codes `STALE_VERSION` and `TEAM_TOO_SMALL`.
- **`packages/core`**:
  - `submitProblems`: Submit needs a title, a write-up and `team_size_min` members.
  - `isAutoSubmittable`.
  - `dueReminder`: the 24-hour reminder covers 24 to 1 hours before the deadline, and the 1-hour reminder the last hour, so a late tick never sends "24 hours left" with minutes to go.
  - `parseIfMatch`.
- **`packages/db`**:
  - `saveSubmission` locks in order: event FOR SHARE with the deadline check, then the team row, then the submission. It checks the version, then checks tracks (they must belong to the event, with at most `max_tracks_per_submission`). Saving keeps the status, so a submitted project stays submitted.
  - `submitSubmission`.
  - `reopenSubmissions` takes the event FOR UPDATE and is audited.
  - `lockSubmissionDeadline` is the lock transaction from DESIGN Step 6 part 1. It:
    - recomputes `below_min_size`;
    - auto-submits drafts with a title and write-up, with `submitted_at` set to the deadline;
    - marks `sha_status` pending for rows with a GitHub link;
    - sets `submissions_locked_at`;
    - writes an audit row.
  - `capturePendingHashes`: network calls run outside any transaction; a thrown error leaves the row pending.
  - `enqueueDeadlineReminders`.
  - A `submission_reminder` email, re-checked at send time: it is superseded if the team has submitted, the person left the team or turned reminders off, or the deadline passed.
  - The tick, inside its advisory-locked transaction, recovers stuck emails, locks deadlines and queues reminders. After that commits, it captures hashes and then sends email.
- **API**

  | Endpoint                                                          | Who                        |
  | ----------------------------------------------------------------- | -------------------------- |
  | `GET /events/{id}/teams/me/submission`                            | member                     |
  | `PUT /events/{id}/teams/me/submission` with `If-Match: <version>` | member, until the deadline |
  | `POST /events/{id}/teams/me/submission/submit`                    | member, until the deadline |
  | `POST /events/{id}/submissions/reopen` {submission_deadline}      | owner                      |

- **Web UI**:
  - `/events/[slug]/submission`, the submission editor:
    - title, tagline;
    - a markdown write-up with Write/Preview tabs (the preview loads only when opened);
    - GitHub, YouTube and demo fields;
    - a track picker;
    - Save and Submit;
    - the status chip, the captured commit, and a countdown.
    - It warns before leaving with unsaved changes, and switches to read-only when the countdown ends or the API says `SUBMISSION_LOCKED`.
  - Save-conflict screen: shows only the fields that differ, side by side, with **Use theirs** or **Keep mine**. Keep mine saves over theirs at their version.
  - Event page: a "Your project" card with status, countdown and a link to the editor.
  - Organizer overview: a Submissions card with submitted, draft and team counts and the deadline state. Owners also get a Reopen form, which takes the new deadline in the event's time zone.
  - Countdowns use the server's clock. The offset comes from the page render and from every API response's `server_time` header, so a wrong laptop clock doesn't matter.

**Tests the plan requires, all present** (`packages/db/src/submissions.int.test.ts`, `apps/web/tests/submissions.int.test.ts`):

- 50 saves timed around the deadline while the lock runs. Each one is either in the locked data (auto-submitted) or got `SUBMISSION_LOCKED`, and none is lost. Both outcomes occur in every run.
- The lock run twice, and by two ticks at once: only one does anything, with one audit row.
- A tick 10 minutes late locks the event. Saves and Submit after the deadline were refused before the late lock ran.
- Auto-submit includes complete drafts and skips empty and title-only ones; small teams are flagged.
- Hash capture with a mocked GitHub: success, 404, and a network failure followed by success.
- Two teammates saving the same version at once: exactly one gets 409, in 10 rounds.
- Reopen restores saving until the new deadline and is audited. It is refused once judging starts, and refused for admin, judge, mentor, volunteer and participant.
- Reminders: one per member, `email_reminders` honoured, deduped, and superseded once the team submits.

### How to try it (dev Supabase project)

1. Apply the new migration: `pnpm exec supabase db push --remote`.
2. Restart `pnpm dev`.
3. As in the README's "Trying every role with one account": confirm your place, make a team, then open **Your project** on the event page.
4. **Deadline lock locally.** pg_cron on the dev project can't reach `localhost`, so run the tick by hand:
   - put `TICK_SECRET=<any long random string>` in `apps/web/.env.local` and restart;
   - after the deadline, run `curl -X POST http://localhost:3000/api/internal/tick -H "x-tick-secret: <same string>"`.

### New dependencies

| Dependency              | Where           | Why                                                                                                                       |
| ----------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `react-markdown` 10.1.0 | web, lazy chunk | Renders write-ups safely: no raw HTML, unsafe link protocols dropped. Judges and the gallery need it too (Phases 5 and 7) |
| `remark-gfm` 4.0.1      | web, lazy chunk | GitHub-style markdown (tables, task lists, autolinks), which is what hackers write                                        |

### Human tasks for the Phase 4 gate

- [ ] Run `pnpm exec supabase db push --remote` to add the submissions tables to the dev project.
- [ ] GitHub token from a CIReN account (read access to public repositories) into Vercel as `GITHUB_TOKEN`. Without it GitHub allows 60 requests an hour, which is enough to try locally.
- [ ] Gate: a test event with the deadline 5 minutes ahead, edited through the deadline. The save after the deadline is refused, the draft is auto-submitted, the hash appears within 2 minutes, and reopen works and shows in `audit_log`.

### Left out, and why

- **`GET /events/{id}/submissions`** (admin list and public gallery): not in this phase's build list. It belongs with judging and results (Phase 5).
- **Teammate-saved notice while editing** (live updates): Phase 6. Until then a conflict shows on save.
- **Mobile countdown**: web-first; see the Mobile app status table.

---

## Phase 3: Tickets, check-in, teams (web; built 20 Nov 2026, gate not yet run)

Built web-first, as the user decided on 20 Nov 2026: every Android item of this phase is in the Mobile app status table instead.

### Status

| Check                                          | Result                                                                                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration 0005 applies cleanly after 0001–0004 | Passed locally (no-Docker database); CI checks it on the real Supabase image                                                                               |
| `pnpm lint && pnpm typecheck && pnpm test`     | Passed: 251 tests, two full runs in a row                                                                                                                  |
| Concurrency tests (Agent rule 20)              | 20 rounds of 20 simultaneous joins for 1 slot, 10 rounds of one person joining two teams, 5 rounds of joins racing the lock: passed in three separate runs |
| `next build`                                   | Passed; `qrcode` is server-only, `jsqr` is a separate chunk loaded only when the browser has no BarcodeDetector                                            |
| QR round trip                                  | A ticket code encoded with our settings decodes back exactly with `jsqr` (unit test)                                                                       |
| Scanner, ticket and team pages in a browser    | **Not checked**: they need a signed-in session. Try them on the dev Supabase project; the camera needs HTTPS or localhost                                  |

### What was built

- **Migration `0005_participation`**: `check_ins`, `teams`, `team_members` with the composite foreign key `(team_id, event_id) → teams (id, event_id)`.
- **`packages/core`**: `generateInviteCode` (8 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, unbiased), `normalizeInviteCode` (accepts lower case, spaces, dashes), `formatInviteCode`, `submissionsClosed`.
- **`packages/db`**:
  - `lockEventForDeadline` (Agent rule 7) and `requireConfirmed`.
  - `hitRateLimit` (fixed window in `rate_limit_counters`).
  - Teams: create (client id; a retry returns the same team), join (event FOR SHARE → team FOR UPDATE → count → insert), leave (ownership to the earliest joiner; the last one out soft-deletes the team, audited), remove member (owner only, audited), rotate code, update, my team, open-team board.
  - `withTeamErrors` maps the `UNIQUE (event_id, user_id)` race to `ALREADY_ON_TEAM`.
  - Check-ins: ticket, scan (second scan → `ALREADY_CHECKED_IN` with the first time), manual (audited), stats, attendee search.
- **Error codes**: `SUBMISSION_LOCKED` (423), `NOT_CONFIRMED`, `TEAM_FULL`, `ALREADY_ON_TEAM`, `INVALID_INVITE_CODE`, `NOT_ON_TEAM`, `ALREADY_CHECKED_IN`, `TICKET_NOT_FOUND`, `TICKET_CANCELLED`.

**API**

| Endpoint                                                                                      | Who                                       |
| --------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `GET /events/{id}/me/ticket`                                                                  | confirmed participant                     |
| `POST /events/{id}/check-ins` {ticket_code}, `GET …/check-ins/stats`                          | owner, admin, volunteer                   |
| `POST /events/{id}/check-ins/manual` {user_id}, `GET …/check-ins/search?q=`                   | owner, admin                              |
| `POST /events/{id}/teams` {name} (client id), `POST …/teams/join` {invite_code} (10 a minute) | confirmed participant, until the deadline |
| `GET /events/{id}/teams?open=true`                                                            | confirmed participant, owner, admin       |
| `GET`, `PATCH /events/{id}/teams/me`; `POST …/me/leave`, `POST …/me/invite-code/rotate`       | member                                    |
| `DELETE /events/{id}/teams/me/members/{userId}`                                               | team owner                                |

**Web UI**

- Event page: when confirmed, a ticket card with the QR code (drawn as SVG on the server) and a team card with the invite code.
- `/events/[slug]/ticket`: full-screen QR, with the code in mono for typing.
- `/events/[slug]/team`: start or join a team, the team card from screens PDF page 5 (initials, invite code well with Copy, new code), team board post, leave, and remove (owner).
- `/organize/[id]/check-in`, screens PDF page 7:
  - Online/Offline chip and "N of M confirmed checked in".
  - Camera view: the built-in BarcodeDetector, or jsQR as a fallback.
  - Result card ("Checked in", or "Already checked in at 08:42 GMT").
  - Typed-code entry, and manual search for owners and admins.
  - Offline, it says "You're offline. Connect to check people in." and pauses scanning.
- The organizer sidebar gets Check-in; volunteers see "Open the scanner" on the overview.

**Tests the plan requires, all present:**

- 20 simultaneous joins for 1 slot, 20 rounds: exactly 1 succeeds and 19 get `TEAM_FULL`.
- One user joining two teams at once: exactly one succeeds.
- Joins and the event lock together: no deadlock.
- The 11th join attempt in a minute: `RATE_LIMITED`, both in the db test and through the API.
- A volunteer can't read applications (Phase 2), and a participant can't check people in.
- Codes never contain look-alikes (2,000 generated).

### Sign-in when Supabase can't be reached (added 20 Nov 2026)

Before sending the browser to Supabase, the sign-in action checks `/auth/v1/health` (3-second timeout). If the service can't be reached, people see "Couldn't reach the sign-in service" on the sign-in page instead of a dead browser error. In a fresh local setup (`NEXT_PUBLIC_SUPABASE_ANON_KEY=local-placeholder`), the page says sign-in isn't set up and points to the README's Mode B. Tests: `apps/web/tests/availability.test.ts`.

### New dependencies

| Dependency                         | Where            | Why                                                                                           |
| ---------------------------------- | ---------------- | --------------------------------------------------------------------------------------------- |
| `qrcode` 1.5.4 (+ `@types/qrcode`) | web, server only | Draws ticket QR codes as SVG                                                                  |
| `jsqr` 1.4.0                       | web, lazy chunk  | Decodes QR codes from the camera on browsers without BarcodeDetector (iPhone Safari, Firefox) |

### Left out, and why

- **Android screens, EAS build profile, first Play closed-test build**: web-first decision; see the Mobile app status table and Q16.
- **Organizer Teams list** (sidebar "Teams" in PDF page 8): not in this phase's build list.
- **Rate limit on invite-code rotation**: Phase 7 (rate limits on joining, rotation, mentor requests).

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
