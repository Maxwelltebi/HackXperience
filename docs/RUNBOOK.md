# HackXperience runbook

For the person on duty during a CIReN event, especially the operator in Ghana. Each section is
one problem: how you notice it, then what to do, step by step. You don't need to read code.

Keep these at hand (from the CIReN password manager):

- the Supabase account (project `hackxperience`), the Vercel account and the AWS account;
- the WhatsApp group for participants and staff;
- the "HackXperience by CIReN" GitHub organization (for backups).

If something here is wrong or a step doesn't work, write down what you saw. Fix this page after
the event.

---

## Before every event: the 72-hour checklist

Do these three days before. Tick each one in the event's WhatsApp staff group.

1. **Smoke test.**
   1. Open the site and sign in.
   2. On a test event, save a test submission.
   3. If it works, the database, sign-in and API are all up.
2. **Manual backup.**
   1. In GitHub, open the repository, then **Actions** → **Nightly backup and keep-alive** → **Run workflow**.
   2. When it finishes, download the artifact and keep it somewhere safe.
3. **Email is healthy.** In AWS, open **SES** → **Account dashboard**. It should show _Production access_ and a healthy sending status.
4. **Volunteers have mobile data.** Check-in runs over the internet, so the venue Wi-Fi isn't enough on its own.
5. **Deploy freeze announced.** Nobody deploys from 24 hours before the event until results are published.
6. **Operator ready.** The Ghana-based operator has this runbook and every login above.

---

## The site says it can't reach the database, or nothing loads

**Likely cause:** Supabase paused the project after a week without use (free plan), or Supabase is
having an outage.

1. Open supabase.com → **Dashboard** → project `hackxperience`.
2. **If it says "Paused":**
   1. Click **Restore project** and wait. It takes a few minutes.
   2. Then do the smoke test (checklist step 1).
3. **If it isn't paused:**
   1. Check status.supabase.com.
   2. If Supabase is down, post on WhatsApp: _"The platform is down. Keep working; we'll extend the deadline."_
   3. When it's back, do **"Reopen submissions after an outage"** below.

## Reopen submissions after an outage

**When:** the site or the venue internet was down near the deadline.

1. Sign in, then go to **Organize** → the event → **Overview**.
2. On the **Submissions** card, click **Reopen submissions**. Only the event owner sees this button.
3. Pick the new deadline, in the event's time zone. It must be before the event's end time; if it isn't, change the end time first in the event form on the same page.
4. Click **Reopen submissions**. Teams can save and submit again until then, and the reopen is written to the audit log.
5. Post the new deadline on WhatsApp.

Reopening works only before judging starts.

## A bad deploy broke something

1. Open vercel.com → project `hackxperience` → **Deployments**.
2. Find the last deployment from **before** the problem started.
3. Click **⋯** → **Promote to Production**, which restores that version.
4. Do the smoke test.

Database changes are always backward-compatible, so going back one deployment is safe.

## The venue Wi-Fi is down at check-in

1. Volunteers switch their phones to mobile data. The scanner works on any connection.
2. If no data works at all, write names on a paper list.
3. When the connection returns, an owner or admin opens **Organize** → **Check-in**.
4. Use **Search** to check each name in by hand. Manual check-ins are audited.

## Emails aren't arriving

**Likely cause:** SES paused sending, or production access isn't approved yet.

1. In AWS, open **SES** → **Account dashboard** and read the status.
2. Nothing is lost. Emails wait in the queue and go out once SES works again; failed ones retry for about 2.5 hours.
3. Meanwhile, tell people on WhatsApp to check the event page. Their status, tickets and results are always there.

## Push notifications aren't arriving

Announcements stay on the event page and the organizer **Announcements** screen. Repeat
important ones on WhatsApp. Dead phone tokens are cleaned up automatically.

## GitHub is down at the deadline

Nothing to do. Commit hashes show "Fetching commit" and are retried every minute. Judging can go
ahead without them.

## An organizer deleted the wrong thing

Deletes are soft: nothing is gone.

- **A team or a project:**
  1. Open **Organize** → the event → **Teams**.
  2. Click **Restore team** or **Restore project** next to it.
- **A whole event:**
  1. Open **Organize**.
  2. Click **Restore** under **Deleted events**.

Only the event owner can delete or restore, and every delete and restore is in the audit log.

## An organizer's account may be taken over

1. Ask them to sign out everywhere, then change the password and turn on 2-factor in their Google or GitHub account.
2. In Supabase, open **Authentication** → **Users** and find them. Use the menu on their row to end their sessions or ban them until they've secured the account. Check the exact option names before your first event, because Supabase renames them now and then.
3. Check what changed: in Supabase, open **SQL Editor** and run

   ```sql
   select created_at, action, entity_type from audit_log order by created_at desc limit 50;
   ```

## The service-role key or a secret may have leaked

1. **Supabase keys:** open Supabase → **Project Settings** → **API Keys** → **Roll** the key.
2. **Other secrets** (`TICK_SECRET`, AWS keys, `GITHUB_TOKEN`, `EXPO_ACCESS_TOKEN`): make a new value in that service.
3. In Vercel, open **Settings** → **Environment Variables**, paste the new values, and redeploy.
4. If you changed `TICK_SECRET`, also update it in Supabase **Vault** (secret `hx_tick_secret`).

## Data loss: restore from a backup

The nightly backup runs from GitHub Actions and is encrypted. To restore, a technical person
runs `scripts/restore.sh` with the downloaded artifact and `BACKUP_ENCRYPTION_KEY` (see the
script's header). Practise once on a local database before the first event: that is the
"restore drill" in the Phase 7 gate.

## Spam or a flood of sign-ups

Sign-in needs Google or GitHub, and applying, joining teams, new invite codes and mentor requests
are rate-limited per person. If one account misbehaves, delete it in Supabase **Authentication**
→ **Users**.

---

## Load test (technical, before the first big event)

1. Deploy a Vercel **preview**. Never load-test production.
2. Create a test event with 80 teams (one member each) and get each member's access token.
3. Save the tokens as a JSON array in `tokens.json`.
4. Set the event's deadline about 60 seconds after you start the run.
5. Run:
   ```bash
   k6 run -e BASE_URL=https://<preview>.vercel.app -e EVENT_ID=<event id> -e TOKENS=tokens.json scripts/loadtest.js
   ```
6. The run passes when it shows no unexpected answers and 95% of saves under 800 ms. Then check in SQL that every team that saved is submitted.
