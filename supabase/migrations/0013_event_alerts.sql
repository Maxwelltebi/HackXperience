-- 0013_event_alerts
-- Event alerts (R42): anyone can leave an email address in the site's pop-up, with no account and
-- no confirmation step, and gets an email when an event is published, when its applications open,
-- and 48 hours before they close. Approved by the product owner on 22 Nov 2026. Additive only.

create table alert_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and char_length(email) <= 254),
  -- In the unsubscribe link of every alert email.
  unsubscribe_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Set when they unsubscribe; signing up again clears it.
  unsubscribed_at timestamptz
);

-- One row per event and alert once its emails are queued, so each alert goes out once, even if
-- the event goes back to draft and is published again.
create table event_alerts_sent (
  event_id uuid not null references events (id) on delete cascade,
  kind text not null check (kind in ('published', 'applications_open', 'closing_soon')),
  queued_at timestamptz not null default now(),
  primary key (event_id, kind)
);

-- Agent rule 6: RLS on, no client policies.
alter table alert_subscribers enable row level security;
alter table event_alerts_sent enable row level security;

-- Alert emails go to subscribers, who may have no account: their outbox rows have no user_id.
-- Widens the check from 0011; every row that passed it still passes.
alter table notification_outbox drop constraint notification_outbox_has_recipient;
alter table notification_outbox add constraint notification_outbox_has_recipient
  check (user_id is not null or template in ('staff_invite', 'event_alert'));
