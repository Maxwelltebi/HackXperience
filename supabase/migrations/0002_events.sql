-- 0002_events
-- Event setup and applications (Phase 2). Source: Canonical schema in docs/BUILD_PLAN.md.
-- Do not edit after it has run.

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

-- Row-level security on, no client policies (Agent rule 6)
alter table events enable row level security;
alter table event_staff enable row level security;
alter table tracks enable row level security;
alter table schedule_items enable row level security;
alter table rubric_criteria enable row level security;
alter table awards enable row level security;
alter table applications enable row level security;
