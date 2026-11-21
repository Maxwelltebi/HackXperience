-- 0006_submissions
-- Submissions and their tracks (Phase 4). Source: Canonical schema in docs/BUILD_PLAN.md.
-- The composite foreign key keeps a submission's event_id equal to its team's.
-- Do not edit after it has run.

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
-- The tick's hash step reads only pending rows.
create index submissions_sha_pending_idx on submissions (id) where sha_status = 'pending';

create table submission_tracks (
  submission_id uuid not null references submissions (id) on delete cascade,
  track_id uuid not null references tracks (id),
  primary key (submission_id, track_id)
);
create index on submission_tracks (track_id);

alter table submissions enable row level security;
alter table submission_tracks enable row level security;
