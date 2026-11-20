-- 0003_notifications
-- Notification outbox and email suppressions (Phase 2). Source: Canonical schema.
-- Do not edit after it has run.

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

alter table notification_outbox enable row level security;
alter table email_suppressions enable row level security;
