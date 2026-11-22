-- 0012_gallery_and_images
-- Owners can open an event's gallery at any time (R40), and teams add images to their project
-- (R41). Approved 21 Nov 2026. Additive only. Do not edit after it has run.

-- Set when an owner publishes the gallery; null again if they hide it. Completed events show
-- their gallery whatever this says.
alter table events add column gallery_published_at timestamptz;

-- Project images. Kept per team, so a team can add images before its project's first save.
-- `path` is the object's key in the project-images storage bucket.
create table project_images (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  team_id uuid not null,
  path text not null unique,
  caption text not null default '' check (char_length(caption) <= 140),
  position integer not null,
  width integer check (width > 0),
  height integer check (height > 0),
  uploaded_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  foreign key (team_id, event_id) references teams (id, event_id) on delete cascade
);
create index on project_images (team_id, position);

-- Agent rule 6: RLS on, no client policies.
alter table project_images enable row level security;

-- The bucket: public to read (galleries are public), written only through signed upload URLs
-- that the API creates for team members. 5 MB, PNG, JPEG or WebP.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-images', 'project-images', true, 5242880,
        array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
