-- 0007_judging
-- Judge assignments, scores and award winners (Phase 5). Source: Canonical schema in
-- docs/BUILD_PLAN.md. Do not edit after it has run.

create table judge_assignments (
  event_id uuid not null references events (id),
  judge_id uuid not null references users (id),
  submission_id uuid not null references submissions (id),
  primary key (judge_id, submission_id)
);
create index on judge_assignments (event_id);
create index on judge_assignments (submission_id);

create table scores (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions (id),
  judge_id uuid not null references users (id),
  criterion_id uuid not null references rubric_criteria (id),
  score numeric not null check (score >= 0),       -- <= max_score checked in the API
  comment text,
  updated_at timestamptz not null default now(),
  unique (submission_id, judge_id, criterion_id)
);
create index on scores (judge_id);

create table award_winners (
  award_id uuid not null references awards (id) on delete cascade,
  team_id uuid not null references teams (id),
  primary key (award_id, team_id)
);
-- Profile badges look winners up by team.
create index on award_winners (team_id);

alter table judge_assignments enable row level security;
alter table scores enable row level security;
alter table award_winners enable row level security;
