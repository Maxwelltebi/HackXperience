# HackXperience: System Design

Nov 18, 2026 · @Maxwell Tebi

## Summary

HackXperience, CIReN's hackathon platform, runs a hackathon in one system: applications, teams, check-in, submissions, judging, results, and impact data. It is built for CIReN first. Multi-tenancy is designed into the schema but not enforced in v1. The design (Steps 1 to 8) was completed on 18 Nov 2026, and the build has not started.

**Name:** HackXperience (short form HX), always written as one word with a capital X. Web address `hack.ciren.network`; Play Store title HackXperience by CIReN; Android package `network.ciren.hackxperience` (fixed after the first upload); email sender HackXperience by CIReN.

- **Stack:** Next.js on Vercel (web app and API), an Expo Android app, Supabase (Postgres, auth, realtime, pg\_cron) in a European region, Amazon SES for email from `notify.ciren.network`, and Expo for push notifications.
- **Budget:** free tiers only, plus a one-time $25 Google Play fee and SES at about $0.10 per 1,000 emails.
- **Timeline:** about 8 milestones, one per week of Thursday to Sunday engineering. The cut line for an early event is Milestone 4, web only.
- **Companion doc:** [HackXperience: Agentic Build Plan](https://claude.ai/artifact/JQ6dVKoU62EdLebHKTfBAE), the phased build document for coding agents.

## Step 1: Requirements and scope

The platform has three account roles, and organizer-side staff get a role per event that sets what they can do.

### Roles

- **Platform admin:** manages the platform. A flag on the user account.
- **Organizer:** runs events. Judges, mentors, and check-in volunteers are organizer-side staff. Each gets an event role (owner, admin, judge, mentor, volunteer) that sets their permissions for that event only.
- **Participant:** applies, joins a team, submits.

Roles come from relationships, not account types. The same person can judge one event and hack at another with one account.

### What the platform does, by event phase

| Phase            | In v1                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Setup            | Organization, event, tracks, schedule, rubric, awards, custom application questions                                                                          |
| Applications     | Apply, review, bulk accept / waitlist / reject, RSVP                                                                                                         |
| Teams            | Create or join by invite code, size limits, one team per person per event, find-a-team board                                                                 |
| Check-in         | QR ticket scanned by a volunteer, online only, with manual check-in as a fallback                                                                            |
| During the event | Push announcements, schedule, mentor help queue                                                                                                              |
| Submission       | Write-up plus optional GitHub, YouTube, and demo links; more than one track allowed; Submit button; editable until the deadline; auto-submit at the deadline |
| Judging          | Human judges score code, video, and write-up against a rubric, Devpost-style                                                                                 |
| Results          | Standings, awards, winner badges on profiles, public gallery, judge comments to teams                                                                        |
| Impact data      | Attendance, demographics, completion rate, mentor response time, returning participants                                                                      |

### Quality requirements

- **Correct deadlines:** the server clock decides; the lock is exact.
- **Auditability:** every decision, score change, and award records who, when, before, and after.
- **Low data use:** small payloads, compressed images, push instead of polling for participants.
- **Availability during event weekends,** not year-round guarantees.
- **Times:** stored in UTC. Each user picks a display timezone; the default is UTC.
- **Tenant isolation:** designed in (`organization_id` on events) but not enforced in v1.

### Out of scope and removed

- **Out of scope for v1:** chat (WhatsApp and Discord already cover it), live streaming, video hosting (YouTube links), pitch decks.
- **Removed:** MoMo payouts, certificates, code-execution judging.
- **Deferred:** the GitHub timestamp integrity check, enforced multi-tenancy, an iOS app.

## Step 2: Scale estimates

One app server and one Postgres database handle this load easily, even at 10 times the size, so the design spends its effort on correctness, not scale.

Assumptions per event (not confirmed against CIReN's real numbers): 500 applicants, 300 accepted, 80 teams, 10 judges, 3 judges per submission, 5 rubric criteria.

| Moment              | Load                                                 | Rough rate                                                       |
| ------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- |
| Check-in rush       | 300 scans in about 45 minutes                        | under 10 per minute                                              |
| Announcement        | 300 push notifications at once                       | handled by Expo's push service                                   |
| Submission deadline | 80 teams, about 10 saves each in the last 15 minutes | about 1 write per second, 10 requests per second with page loads |
| Judging             | 80 submissions × 3 judges × 5 criteria               | 1,200 score rows per event                                       |

Storage per event: a few MB of rows, about 100 MB of profile photos, nothing for videos (YouTube links) or decks (not collected). Even 10 events a year fits the free database tier.

What this rules out for v1: microservices, message queues, a caching layer, read replicas. The pressure points are the deadline minute, check-in, mobile data cost, and judge consistency.

## Step 3: Data model

The schema has 26 tables in Postgres; the database itself enforces the rules that matter most (one team per event, one application per event, one score per judge per criterion). This list includes every change made in Steps 4 to 7.

### Design decisions

1. **Roles come from relationships.** One `users` table. Event staff come from `event_staff`; participants from an accepted application. Platform admin is a flag.
2. **The database enforces the one-team rule** with `UNIQUE (event_id, user_id)` on `team_members`. An application check alone fails when two joins arrive at once.
3. **Demographics are real columns** on `profiles` so impact reports can count them. Event-specific questions are JSON.
4. **Badges are computed** from `award_winners` and `team_members`. No badge table.
5. **All times are stored in UTC.** Events and users each have a display timezone, default UTC.
6. **Soft deletes** (`deleted_at`) on events, teams, and submissions so organizer mistakes can be undone.

### Tables

| Group            | Table                 | Columns                                                                                                                                                                                                                                                                                                                                     | Constraints and notes                                                                                                       |
| ---------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Identity         | `users`               | id, email, name, is\_platform\_admin, created\_at                                                                                                                                                                                                                                                                                           |                                                                                                                             |
| Identity         | `profiles`            | user\_id, bio, avatar\_url, github\_username, school, level\_of\_study, graduation\_year, country, gender (optional), timezone (default UTC), email\_reminders (default true)                                                                                                                                                               | PK (user\_id)                                                                                                               |
| Identity         | `organizations`       | id, name, slug                                                                                                                                                                                                                                                                                                                              | CIReN is the first row                                                                                                      |
| Identity         | `org_members`         | org\_id, user\_id                                                                                                                                                                                                                                                                                                                           | Can create events for the org                                                                                               |
| Identity         | `push_tokens`         | user\_id, token, platform                                                                                                                                                                                                                                                                                                                   | Deleted when Expo reports DeviceNotRegistered                                                                               |
| Event setup      | `events`              | id, organization\_id, name, slug, description, timezone, mode, location, applications\_open\_at, applications\_close\_at, starts\_at, submission\_deadline, ends\_at, team\_size\_min, team\_size\_max, max\_tracks\_per\_submission, application\_questions (JSON), status, submissions\_locked\_at, results\_snapshot (JSON), deleted\_at | status: draft, published, live, judging, completed                                                                          |
| Event setup      | `event_staff`         | event\_id, user\_id, role                                                                                                                                                                                                                                                                                                                   | PK (event\_id, user\_id, role); role: owner, admin, judge, mentor, volunteer                                                |
| Event setup      | `tracks`              | id, event\_id, name, description                                                                                                                                                                                                                                                                                                            |                                                                                                                             |
| Event setup      | `schedule_items`      | id, event\_id, title, starts\_at, ends\_at, location                                                                                                                                                                                                                                                                                        |                                                                                                                             |
| Participation    | `applications`        | id, event\_id, user\_id, answers (JSON), status, ticket\_code, decided\_by, decided\_at, created\_at                                                                                                                                                                                                                                        | UNIQUE (event\_id, user\_id); UNIQUE (ticket\_code); status: submitted, accepted, waitlisted, rejected, confirmed, declined |
| Participation    | `check_ins`           | id, event\_id, user\_id, checked\_in\_by, method, created\_at                                                                                                                                                                                                                                                                               | UNIQUE (event\_id, user\_id); method: scan or manual                                                                        |
| Participation    | `teams`               | id, event\_id, name, invite\_code, owner\_id, looking\_for\_members, looking\_for, created\_at, deleted\_at                                                                                                                                                                                                                                 | UNIQUE (invite\_code)                                                                                                       |
| Participation    | `team_members`        | team\_id, event\_id, user\_id, joined\_at                                                                                                                                                                                                                                                                                                   | UNIQUE (event\_id, user\_id)                                                                                                |
| Submissions      | `submissions`         | id, event\_id, team\_id, title, tagline, write\_up, github\_url, youtube\_url, demo\_url, status, submitted\_at, auto\_submitted, below\_min\_size, version, locked\_commit\_sha, sha\_status, sha\_fetched\_at, updated\_at, deleted\_at                                                                                                   | UNIQUE (team\_id); status: draft or submitted; sha\_status: pending, captured, unreachable, none                            |
| Submissions      | `submission_tracks`   | submission\_id, track\_id                                                                                                                                                                                                                                                                                                                   |                                                                                                                             |
| Judging          | `rubric_criteria`     | id, event\_id, name, description, max\_score, weight, position, is\_tiebreaker                                                                                                                                                                                                                                                              |                                                                                                                             |
| Judging          | `judge_assignments`   | event\_id, judge\_id, submission\_id                                                                                                                                                                                                                                                                                                        |                                                                                                                             |
| Judging          | `scores`              | id, submission\_id, judge\_id, criterion\_id, score, comment, updated\_at                                                                                                                                                                                                                                                                   | UNIQUE (submission\_id, judge\_id, criterion\_id)                                                                           |
| Judging          | `awards`              | id, event\_id, track\_id (empty for overall), name, rank                                                                                                                                                                                                                                                                                    |                                                                                                                             |
| Judging          | `award_winners`       | award\_id, team\_id                                                                                                                                                                                                                                                                                                                         | Source of profile badges                                                                                                    |
| During the event | `announcements`       | id, event\_id, author\_id, title, body, created\_at, pushed\_at                                                                                                                                                                                                                                                                             |                                                                                                                             |
| During the event | `mentor_requests`     | id, event\_id, team\_id, requested\_by, topic, description, status, claimed\_by, created\_at, claimed\_at, resolved\_at                                                                                                                                                                                                                     | status: open, claimed, resolved, cancelled                                                                                  |
| Accountability   | `audit_log`           | id, event\_id, actor\_id, action, entity\_type, entity\_id, before (JSON), after (JSON), created\_at                                                                                                                                                                                                                                        | Append-only                                                                                                                 |
| Notifications    | `notification_outbox` | id, user\_id, channel, template, payload (JSON), dedupe\_key, status, send\_after, locked\_until, attempts, last\_error, provider\_message\_id, created\_at, sent\_at                                                                                                                                                                       | UNIQUE (dedupe\_key); channel: email or push; status: pending, sending, sent, failed, suppressed, superseded                |
| Notifications    | `email_suppressions`  | email, reason, created\_at                                                                                                                                                                                                                                                                                                                  | PK (email); reason: bounce or complaint                                                                                     |
| Platform         | `rate_limit_counters` | key, window\_start, count                                                                                                                                                                                                                                                                                                                   | Fixed-window rate limits for sensitive endpoints                                                                            |

### Where the impact report comes from

Applicants, accepted, and checked-in counts come from `applications` and `check_ins`; demographics from `profiles` joined to `check_ins`; completion rate from `submissions` over `teams`; mentor response time from `mentor_requests`; returning participants from users with check-ins at more than one event.

## Step 4: API design

The API is REST with JSON under `/api/v1`, served by Next.js route handlers; every write from the web and mobile apps goes through it.

### Conventions

- Almost every path sits under `/events/{eventId}/...`. One middleware loads the caller's roles for that event, and each endpoint declares the roles it accepts.
- Auth: Supabase session cookie on web, bearer token on mobile. Sign-in with Google or GitHub only.
- IDs are UUIDs. Times are ISO 8601 in UTC. Every response carries a `server_time` header for client countdowns.
- Lists that can grow use cursor pagination (`?cursor=`).
- One error shape: `{"error": {"code": "TEAM_FULL", "message": "...", "details": {}}}`. Clients switch on `code`.
- Mobile creates accept an `Idempotency-Key` header.

### Endpoints

| Group        | Method and path                                                 | Who                           | Notes                                    |
| ------------ | --------------------------------------------------------------- | ----------------------------- | ---------------------------------------- |
| Auth         | `POST /auth/google`, `POST /auth/github`                        | anyone                        | OAuth callback                           |
| Auth         | `POST /auth/logout`                                             | signed in                     |                                          |
| Profile      | `GET /me`                                                       | signed in                     | user, profile, roles per event           |
| Profile      | `PATCH /me/profile`                                             | signed in                     | includes timezone and email\_reminders   |
| Profile      | `GET /users/{id}/profile`                                       | anyone                        | public profile with computed badges      |
| Profile      | `POST /me/push-tokens`, `DELETE /me/push-tokens/{token}`        | signed in                     |                                          |
| Setup        | `POST /orgs/{orgId}/events`                                     | org member                    | creates a draft event                    |
| Setup        | `GET /events`, `GET /events/{id}`                               | anyone                        | published events only                    |
| Setup        | `PATCH /events/{id}`                                            | owner, admin                  |                                          |
| Setup        | `POST /events/{id}/status`                                      | owner, admin                  | allowed transitions only                 |
| Setup        | `GET`, `POST`, `DELETE /events/{id}/staff`                      | owner                         | invite by email with a role              |
| Setup        | CRUD `/events/{id}/tracks`, `/schedule`, `/rubric`, `/awards`   | owner, admin                  |                                          |
| Applications | `POST /events/{id}/applications`                                | signed in                     | only while applications are open         |
| Applications | `GET /events/{id}/applications/me`                              | applicant                     |                                          |
| Applications | `POST /events/{id}/applications/me/rsvp`                        | accepted applicant            | confirm or decline                       |
| Applications | `GET /events/{id}/applications?status=`                         | owner, admin                  | paginated                                |
| Applications | `POST /events/{id}/applications/decisions`                      | owner, admin                  | bulk, one audit row each                 |
| Check-in     | `GET /events/{id}/me/ticket`                                    | confirmed participant         | QR payload = ticket\_code                |
| Check-in     | `POST /events/{id}/check-ins`                                   | volunteer, admin              | `{"ticket_code": "..."}`, online only    |
| Check-in     | `POST /events/{id}/check-ins/manual`                            | owner, admin                  | by user, audited                         |
| Teams        | `POST /events/{id}/teams`                                       | confirmed, not on a team      | returns invite code                      |
| Teams        | `POST /events/{id}/teams/join`                                  | confirmed, not on a team      | `{"invite_code": "..."}`                 |
| Teams        | `POST /events/{id}/teams/me/leave`                              | member                        | ownership passes to earliest joiner      |
| Teams        | `POST /events/{id}/teams/me/invite-code/rotate`                 | member                        |                                          |
| Teams        | `DELETE /events/{id}/teams/me/members/{userId}`                 | team owner                    |                                          |
| Teams        | `GET /events/{id}/teams/me`, `GET /events/{id}/teams?open=true` | member, confirmed participant | find-a-team board                        |
| Submissions  | `GET`, `PUT /events/{id}/teams/me/submission`                   | member                        | PUT needs `If-Match` version             |
| Submissions  | `POST /events/{id}/teams/me/submission/submit`                  | member                        | requires team\_size\_min                 |
| Submissions  | `POST /events/{id}/submissions/reopen`                          | owner                         | new deadline, audited                    |
| Submissions  | `GET /events/{id}/submissions`                                  | admin; anyone after completed | public gallery                           |
| Judging      | `POST /events/{id}/judging/assign`                              | owner, admin                  | N judges per submission, balanced        |
| Judging      | `GET /events/{id}/judging/me`                                   | judge                         | assigned queue                           |
| Judging      | `GET /events/{id}/submissions/{sid}`                            | assigned judge, admin         |                                          |
| Judging      | `PUT /events/{id}/submissions/{sid}/scores/me`                  | assigned judge                | all criteria at once, only while judging |
| Judging      | `GET /events/{id}/judging/standings`                            | owner, admin                  | raw and normalized                       |
| Judging      | `POST /events/{id}/awards/{aid}/winners`                        | owner, admin                  |                                          |
| Results      | `GET /events/{id}/results`                                      | anyone after completed        | from the snapshot                        |
| Live         | `POST /events/{id}/announcements`                               | owner, admin                  | saves and queues push                    |
| Live         | `GET /events/{id}/announcements?since=`                         | participants, staff           |                                          |
| Live         | `POST /events/{id}/mentor-requests`                             | member                        |                                          |
| Live         | `GET /events/{id}/mentor-requests?status=open`                  | mentor                        |                                          |
| Live         | `POST /mentor-requests/{rid}/claim`, `/resolve`, `/cancel`      | mentor; requester for cancel  | conditional update for claim             |
| Reports      | `GET /events/{id}/reports/impact?format=json` or `csv`          | owner, admin                  |                                          |
| Reports      | `GET /orgs/{orgId}/reports/impact?from=&to=`                    | org member                    | across events                            |
| Audit        | `GET /events/{id}/audit-log`                                    | owner                         | filter by entity                         |
| Internal     | `POST /api/internal/tick`                                       | pg\_cron, secret header       | deadline lock, hashes, outbox            |
| Internal     | `POST /api/internal/ses-events`                                 | SNS                           | bounces and complaints                   |

### Submission save

Every GET returns a `version`; every PUT sends it back in `If-Match`. Responses: `200` saved with a new version; `409 STALE_VERSION` when a teammate saved first; `423 SUBMISSION_LOCKED` after the deadline. A Submit button marks it submitted, it stays editable until the deadline, and drafts with a title and write-up are auto-submitted at the deadline. Links are checked: GitHub links must be `github.com/owner/repo` and public.

### Five rules every endpoint follows

1. The server's clock is the only clock; deadline checks run inside the write's transaction.
2. Status changes are actions with checked transitions, not field edits.
3. Each role sees only its own data: judges see only assigned submissions and their own scores; teams see only their own submission until results; volunteers never see applications.
4. Every mobile create is safe to retry.
5. Mobile payloads stay small.

### Who can do what

| Action                                           | Owner | Admin | Judge         | Mentor | Volunteer | Participant    |
| ------------------------------------------------ | ----- | ----- | ------------- | ------ | --------- | -------------- |
| Edit event, change status                        | yes   | yes   |               |        |           |                |
| Manage staff, read audit log, reopen submissions | yes   |       |               |        |           |                |
| Decide applications, manual check-in             | yes   | yes   |               |        |           |                |
| Scan check-ins                                   | yes   | yes   |               |        | yes       |                |
| Score submissions                                |       |       | assigned only |        |           |                |
| Claim mentor requests                            |       |       |               | yes    |           |                |
| Create or join a team, submit                    |       |       |               |        |           | confirmed only |

## Step 5: Architecture

Next.js on Vercel serves the web app and the API, Supabase holds the data, auth, and WebSockets, and SES sends email; everything runs on free tiers except SES, which costs cents.

&#91;embedded content: architecture · clients, Vercel, Supabase, external services\]

Clients write only through the API routes; Postgres commits trigger Realtime hints back to open screens, and the minute tick reaches SES, Expo, and GitHub.

### Stack

| Piece                               | Choice                              | Why                                                                                   |
| ----------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------- |
| Web app and API                     | Next.js on Vercel Hobby             | One codebase for pages and `/api/v1`. Hobby is non-commercial only, which fits CIReN. |
| Mobile                              | Expo (React Native), Android        | Free push notifications; 30 free builds a month.                                      |
| Database, auth, WebSockets, storage | Supabase free plan, European region | 500 MB database, 50,000 monthly users, 1 GB storage, 200 realtime connections.        |
| Scheduled jobs                      | `pg_cron` + `pg_net` in Supabase    | Minute precision. Vercel Hobby cron runs only once a day.                             |
| Email                               | Amazon SES, `notify.ciren.network`  | No daily cap; about $0.10 per 1,000 emails on à la carte pricing.                     |
| Push                                | Expo push service                   | Free.                                                                                 |
| Code layout                         | One TypeScript monorepo             | Shared types and Zod validation across web, mobile, and API.                          |

Rejected: Firebase (NoSQL; the schema needs unique constraints, transactions, and SQL reports) and a self-hosted WebSocket server (free tiers do not keep a server running).

### How a request moves

1. **Normal request:** the app calls an API route with its Supabase token. The route checks the token, loads event roles, and runs one transaction through Supabase's connection pooler.
2. **Live updates:** after a write commits, a small hint message goes out on a Supabase Realtime channel; subscribed screens refetch.
3. **Deadline:** `pg_cron` calls `/api/internal/tick` every minute. The tick locks submissions, auto-submits drafts, captures commit hashes, and sends notifications.
4. **Notifications:** the API writes `notification_outbox` rows in the same transaction as the change; the tick sends them through SES and Expo.

### Free-tier limits that shape the design

| Limit                               | Effect                                                 | Response                                                                                       |
| ----------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Supabase pauses after 1 week idle   | Platform offline between events                        | Keep-alive request in the nightly GitHub Action; check Supabase's terms                        |
| No backups on Supabase free         | Scores and audit log could be lost                     | Nightly encrypted `pg_dump` from GitHub Actions, plus manual dumps before and after each event |
| 200 concurrent realtime connections | 300 open participant sockets would exceed it           | Sockets for staff screens; participants get push; polling fallback                             |
| Vercel Hobby is non-commercial      | Charging other organizations later needs the paid plan | Fine while it serves CIReN                                                                     |

### Costs

- **Google Play:** $25 once. New personal accounts must run a closed test with 12 testers for 14 continuous days before production.
- **iOS:** not built. Apple charges $99 a year; iPhone users use the web app.
- **SES:** switch from the default Essentials plan ($0.16 per 1,000) to à la carte ($0.10 per 1,000). About $0.40 a year at 4 events of 1,000 emails.
- **AWS account:** must be on the Paid plan, because the Free plan closes the account after 6 months. Protect it with root MFA, a zero-spend budget, and a $1 alert.

### AWS evaluation

AWS always-free services (Lambda, EventBridge Scheduler, DynamoDB) were considered. AWS lost as the core: no always-free Postgres, API Gateway WebSockets are free for 12 months only, DynamoDB is NoSQL, and Aurora DSQL lacks extensions and (per a late-2025 review) explicit locking. SES was adopted because CIReN owns `ciren.network`. EventBridge Scheduler was skipped for v1 to keep one scheduler.

### SES setup

1. Create the AWS account on the Paid plan, with root MFA and budget alerts.
2. Pick one region and keep it.
3. Verify `notify.ciren.network` with Easy DKIM.
4. Set the custom MAIL FROM domain `bounce.notify.ciren.network`.
5. Add DMARC at `_dmarc.notify.ciren.network`, starting at `p=none`.
6. Switch pricing to à la carte.
7. Request production access early (sandbox: verified recipients only, 200 per day).
8. Create sending credentials limited to `ses:SendEmail` on that identity; store them in Vercel. OIDC federation can replace stored keys after v1.
9. Route bounces and complaints through SNS to `/api/internal/ses-events`.
10. Test with Gmail and Outlook; SPF, DKIM, and DMARC must all pass.

| Type      | Name                                      | Value                                                  |
| --------- | ----------------------------------------- | ------------------------------------------------------ |
| CNAME × 3 | `<token>._domainkey.notify.ciren.network` | from the SES console                                   |
| MX        | `bounce.notify.ciren.network`             | `10 feedback-smtp.<region>.amazonses.com`              |
| TXT       | `bounce.notify.ciren.network`             | `v=spf1 include:amazonses.com ~all`                    |
| TXT       | `_dmarc.notify.ciren.network`             | `v=DMARC1; p=none; rua=mailto:admin.cirenet@gmail.com` |

Emails come from `HackXperience by CIReN <hackathons@notify.ciren.network>` with Reply-To `admin.cirenet@gmail.com`. None of these records touch the root domain.

## Step 6: Deep dives

Five parts carry the hard engineering: the deadline lock, team joins, judging math, realtime channels, and the notification outbox.

### 1. Deadline lock and auto-submit

**Problem:** a save that starts at 11:59:59.9 and commits at 12:00:00.2 can race the tick, so the judged version differs from the saved one.

**Fix:** every deadline-sensitive write (save, submit, join, leave) first takes a shared lock on the event row and rejects with `423` if `submissions_locked_at` is set or `now() >= submission_deadline`. The tick takes an exclusive lock on the same row, which waits for in-flight writes and blocks new ones. Postgres `now()` is the transaction start, so a request that reached the server before the deadline counts.

```sql
-- every deadline-sensitive write
SELECT submission_deadline, submissions_locked_at FROM events WHERE id = $1 FOR SHARE;

-- the tick, once per event
BEGIN;
SELECT id FROM events
WHERE id = $1 AND submissions_locked_at IS NULL AND submission_deadline <= now()
FOR UPDATE;
UPDATE submissions
SET status = 'submitted', submitted_at = $deadline, auto_submitted = true
WHERE event_id = $1 AND status = 'draft' AND title <> '' AND write_up <> '';
UPDATE events SET submissions_locked_at = now() WHERE id = $1;
INSERT INTO audit_log (...) VALUES (...);
COMMIT;
```

- **Commit hashes** are fetched after the lock, never inside it, with a CIReN GitHub token. `sha_status` goes from pending to captured or unreachable; failures retry on the next tick. The hash is captured within about a minute of the deadline; exact capture needs a GitHub App (deferred).
- **The tick runs once per event** (`submissions_locked_at IS NULL`) and never twice at once (`pg_try_advisory_lock`). A late tick gives nobody extra time, because every write checks the clock itself.
- **Phone clocks are wrong:** countdowns use the `server_time` header offset.
- **Teams below `team_size_min`** cannot press Submit; at the deadline their draft is auto-submitted and marked `below_min_size` for organizers.

### 2. Team joins under concurrency

| Problem                               | Fix                                                                                                             |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Two people take the last slot at once | `SELECT ... FROM teams ... FOR UPDATE` serializes joins per team; then count, then insert                       |
| One person joins two teams at once    | `UNIQUE (event_id, user_id)` on `team_members`; the second insert fails with `ALREADY_ON_TEAM`                  |
| Deadlocks                             | Every transaction locks the event row first, then the team row                                                  |
| Leaked invite code                    | 8 characters with no look-alikes, 10 join attempts per user per minute, code rotation, owner can remove members |

Ownership passes to the earliest joiner when the owner leaves; when the last member leaves, the team and its draft are deleted.

### 3. Judging math

Raw averages reward projects that drew generous judges. Each judge's weighted total (0 to 100) is converted to a z-score against that judge's own mean and spread; a project's score is the average z across its judges.

```latex
\text{total} = 100 \cdot \frac{\sum_c (s_c / \text{max}_c) \cdot w_c}{\sum_c w_c} \qquad z = \frac{\text{total} - \mu_{\text{judge}}}{\sigma_{\text{judge}}}
```

- **Guards:** a judge with fewer than 4 scores, or a spread of 0, uses the pooled mean and spread of all judges.
- **Assignment:** shuffle submissions; give each one the 3 judges with the fewest assignments, ties broken at random, conflicts skipped.
- **Ties:** first the tiebreaker criterion, then organizers decide. Never by submission time.
- **People decide:** standings show raw and normalized scores and judging progress; organizers assign awards. Results are frozen in `results_snapshot` at publication.
- **Computed on request** by a pure, unit-tested `computeStandings` function. Teams see anonymized judge comments after results.

### 4. Realtime channels

| Channel                    | Subscribers                   | Carries                                    |
| -------------------------- | ----------------------------- | ------------------------------------------ |
| `event:{id}:staff`         | owner, admin                  | live counts (sent as numbers)              |
| `event:{id}:mentors`       | mentors, admins               | mentor queue changes                       |
| `event:{id}:announcements` | anyone at the event, web only | new announcements                          |
| `team:{id}`                | that team's members           | teammate saved, member joined or left      |
| `user:{id}`                | that user                     | personal changes, such as a new assignment |

- **Private channels,** authorized by row-level security on `realtime.messages`.
- **Hints, not data:** `{"type": "mentor_request.claimed", "id": "...", "version": 7}`; the client refetches through the API.
- **Reconnects:** subscribe first, then fetch; ignore messages older than the shown version; refetch on every reconnect.
- **Only after commit:** broadcast from the database inside the transaction, or call the HTTP broadcast after the commit succeeds.
- **Under 200 connections:** one socket per open client; participants join team and announcement channels only on the pages that need them; polling every 30 seconds as a fallback.

### 5. Notification outbox

The tick claims up to 200 due rows with `FOR UPDATE SKIP LOCKED`, marks them `sending` with a 2-minute `locked_until`, and sends them.

- **Email:** checks `email_suppressions` first, then sends through SES at the account's per-second rate.
- **Push:** Expo batches; a `DeviceNotRegistered` receipt deletes the token.
- **Retries:** 1 minute, 5 minutes, 30 minutes, 2 hours; after 5 attempts the row is `failed` and shown to organizers. Rows stuck in `sending` past `locked_until` return to `pending`.
- **At least once, not exactly once:** a crash after SES accepts can send an email twice. `dedupe_key` stops duplicate rows, and nothing is ever lost.
- **Undo window:** decision emails wait 10 minutes and re-check the application before sending; a changed decision marks the row `superseded`.

| Notification                   | Email             | Push                 |
| ------------------------------ | ----------------- | -------------------- |
| Application decision, results  | always            | if they have the app |
| Team invite, member joined     | no                | yes                  |
| Deadline reminders (24 h, 1 h) | yes, can turn off | yes                  |
| Announcements                  | no                | yes                  |

## Step 7: Failure modes and tradeoffs

The biggest single risk is one person holding every login: events run in Ghana, 5 hours ahead of New York, so a 9:00 AM problem at the venue is 4:00 AM for the builder.

- Create every service account under a CIReN email.
- Share logins through a password manager (Bitwarden free supports 2 people) with one technical person in Ghana.
- Keep a one-page runbook so that person can act alone.

### Failures and responses

| Failure                                   | What breaks              | Prevention                                                                                     | Response                                                                                |
| ----------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Supabase paused from inactivity           | Everything               | Keep-alive request; smoke test 72 hours before each event                                      | Restore the project from the dashboard, rerun the smoke test                            |
| Supabase or Vercel outage mid-event       | Everything               | None at this price; WhatsApp group as backup channel                                           | Post updates on WhatsApp; after recovery, owner reopens submissions with a new deadline |
| Bad deploy during an event                | Whatever the bug touches | Deploy freeze from 24 hours before until results; backward-compatible migrations only          | Restore the previous deployment from Vercel's dashboard                                 |
| Database far from users                   | Slow pages               | Supabase in a European region; Vercel functions in the same city                               | Decide before the first deploy; moving later is hard                                    |
| Venue Wi-Fi down                          | Check-in and submissions | Volunteers carry mobile data                                                                   | Paper list, then manual check-in; owner reopens submissions if needed                   |
| GitHub down at the deadline               | Commit hashes            | Token-based requests                                                                           | Hashes stay pending and retry; judging continues                                        |
| SES pauses sending or access not approved | Emails                   | Suppression list, sign-in-verified addresses, no imported lists                                | Emails wait in the outbox; push and in-app status still work                            |
| Push fails                                | Announcement alerts      | Token cleanup from receipts                                                                    | Announcements remain on the event page                                                  |
| Data loss                                 | Scores, audit log        | Nightly encrypted dump; dumps before and after events; one restore test before the first event | Restore from the latest dump                                                            |
| Organizer deletes the wrong thing         | That record              | Soft deletes                                                                                   | Owner restores it                                                                       |
| Service-role key leaks                    | Every security policy    | Key only in Vercel server env, never in bundles                                                | Rotate the key in Supabase                                                              |
| Organizer account taken over              | Event data               | Require 2-factor on Google or GitHub                                                           | Audit log shows every change                                                            |
| Spam or scraping                          | Load, data exposure      | OAuth sign-in, Postgres rate limits                                                            | Raise limits or block accounts                                                          |

### Tradeoffs accepted

| Decision                              | Gained                      | Gave up                                                           |
| ------------------------------------- | --------------------------- | ----------------------------------------------------------------- |
| Free tiers only                       | $0 a month                  | Uptime guarantees, built-in backups, more than 200 sockets        |
| Supabase for auth, database, realtime | Little plumbing             | Auth and realtime tied to Supabase                                |
| All writes through the API            | Rules in one place          | One extra hop                                                     |
| Online-only check-in, no photo        | Simple and fast             | Needs data at the door; a forwarded QR works for the wrong person |
| Realtime hints, not data              | No leaks, simple reconnects | One extra fetch per update                                        |
| At-least-once notifications           | Nothing lost                | A rare duplicate email                                            |
| Z-score judging                       | Fairness across judges      | Harder to explain, so raw scores are shown too                    |
| Android-only app                      | No Apple fee                | iPhone users on the web without push                              |
| Hash captured within a minute         | No GitHub App in v1         | A push in the first minute can be recorded                        |

### Pre-event checklist (72 hours before)

- [ ] Smoke test: sign in, save a test submission on a test event
- [ ] Manual backup taken and stored
- [ ] SES sending status healthy, production access approved
- [ ] Volunteers confirmed to have mobile data
- [ ] Deploy freeze announced
- [ ] Ghana-based operator has the runbook and logins

## Step 8: Build plan, decisions, open questions

v1 is about 8 milestones, one per week of Thursday to Sunday engineering; the full phase-by-phase instructions live in the companion build document.

1. Foundations: monorepo, sign-in, profiles, backups
2. Events, roles, applications, decisions, audit log, SES outbox
3. RSVP, tickets, check-in, teams; first Android build into the Play closed test
4. Submissions, deadline lock, auto-submit, commit hashes
5. Judging, standings, awards, badges, gallery
6. Announcements, mentor queue, realtime
7. Impact reports, rate limits, soft deletes, runbook, load test
8. Dry run with 15 to 20 people, then Play production access

**Cut line for an early event:** milestones 1 to 5 on web only. The web app works on phones, including QR scanning in the browser. Never cut: the deadline lock, concurrency protections, the audit log, and backups.

**Start now, because they take calendar time:** SES production access, the Google Play account and closed test (12 testers for 14 days; recruit 15), and every account under a CIReN email.

### Decision log

| Decision              | Choice                                                                  |
| --------------------- | ----------------------------------------------------------------------- |
| Name                  | HackXperience (HX) at `hack.ciren.network`                              |
| Account roles         | Platform admin, organizer, participant; staff get event roles           |
| Judging               | Human judges against a rubric; z-score normalization                    |
| Cheating check        | GitHub timestamp check deferred; commit hash saved at the deadline      |
| Payouts, certificates | Removed; winner badges on profiles instead                              |
| Tenants               | `organization_id` stored, not enforced                                  |
| Decks                 | Not collected                                                           |
| Submission links      | GitHub, YouTube, demo; each optional                                    |
| Submit flow           | Submit button; editable until the deadline; auto-submit at the deadline |
| Login                 | Google and GitHub                                                       |
| Tracks                | A submission can enter more than one                                    |
| Timezone              | Stored in UTC; users choose a display zone, default UTC                 |
| Check-in              | Online only, no photo; offline notice; manual fallback                  |
| Stack                 | Next.js on Vercel, Supabase, Expo Android, SES                          |
| Realtime              | WebSockets through Supabase Realtime                                    |
| Email                 | Amazon SES from `notify.ciren.network`                                  |
| Hosting budget        | Free tiers, one-time fees only; SES at cents                            |

### Open questions

- [ ] When is the next CIReN event? It decides full plan or cut line.
- [ ] Is the build solo, or can a CIReN member take the mobile app or organizer dashboard?
- [ ] Should drafts with no title and no write-up be judged? Current rule: no.
- [ ] Which European regions does Supabase offer at project creation (London or Frankfurt preferred)?
- [ ] Real event sizes for CIReN, to recheck the Step 2 estimates.
- [ ] Will the CIReN team rename the event series to CIReN Xperience (proposed from 5.0, written as "formerly The CIReN Experience" for one edition)?
- [ ] Play Store and US trademark search for HackXperience before the first store listing.
