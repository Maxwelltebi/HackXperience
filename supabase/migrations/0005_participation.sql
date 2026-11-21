-- 0005_participation
-- Check-ins, teams and team members (Phase 3). Source: Canonical schema in docs/BUILD_PLAN.md.
-- The composite foreign key keeps a member's event_id equal to their team's, so the
-- UNIQUE (event_id, user_id) constraint really means "one team per person per event".
-- Do not edit after it has run.

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

alter table check_ins enable row level security;
alter table teams enable row level security;
alter table team_members enable row level security;
