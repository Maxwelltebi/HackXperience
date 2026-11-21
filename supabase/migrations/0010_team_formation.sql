-- 0010_team_formation
-- Organizer team forming (R36, approved 21 Nov 2026). Additive only.
-- Applicants rate four built-in skills, 1 to 5; organizers group confirmed participants who have
-- no team into balanced teams, as a draft they edit and then publish.
-- Do not edit after it has run.

-- {"coding": 1-5, "design": 1-5, "business": 1-5, "presentation": 1-5}. Null for applications
-- made before ratings existed, until the participant adds them.
alter table applications add column skill_ratings jsonb;
alter table applications add constraint applications_skill_ratings_object
  check (skill_ratings is null or jsonb_typeof(skill_ratings) = 'object');

-- One draft per event. `teams` is [{"name": text, "member_ids": [uuid, …]}, …]. Nobody but
-- owners and admins sees it; publishing creates the real teams and deletes the draft.
create table team_drafts (
  event_id uuid primary key references events (id) on delete cascade,
  teams jsonb not null check (jsonb_typeof(teams) = 'array'),
  version integer not null default 1,
  updated_by uuid not null references users (id),
  updated_at timestamptz not null default now()
);

-- Agent rule 6: RLS on, no client policies. The API connects as the table owner.
alter table team_drafts enable row level security;
