-- 0008_live
-- Announcements and the mentor help queue (Phase 6). Source: Canonical schema in
-- docs/BUILD_PLAN.md. Do not edit after it has run.

create table announcements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id),
  author_id uuid not null references users (id),
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  pushed_at timestamptz
);
create index on announcements (event_id, created_at desc);

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
create index on mentor_requests (team_id);

alter table announcements enable row level security;
alter table mentor_requests enable row level security;
