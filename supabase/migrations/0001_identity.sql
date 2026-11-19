-- 0001_identity
-- Enum types for every phase, identity tables, the CIReN organization, and the
-- trigger that creates users and profiles rows for each new auth user.
-- Source: Canonical schema in docs/BUILD_PLAN.md. Do not edit after it has run.

-- Types
create type event_status as enum ('draft', 'published', 'live', 'judging', 'completed');
create type event_mode as enum ('in_person', 'virtual', 'hybrid');
create type staff_role as enum ('owner', 'admin', 'judge', 'mentor', 'volunteer');
create type application_status as enum ('submitted', 'accepted', 'waitlisted', 'rejected', 'confirmed', 'declined');
create type checkin_method as enum ('scan', 'manual');
create type submission_status as enum ('draft', 'submitted');
create type sha_state as enum ('none', 'pending', 'captured', 'unreachable');
create type mentor_request_status as enum ('open', 'claimed', 'resolved', 'cancelled');
create type notification_channel as enum ('email', 'push');
create type notification_status as enum ('pending', 'sending', 'sent', 'failed', 'suppressed', 'superseded');
create type suppression_reason as enum ('bounce', 'complaint');

-- Identity (Phase 1)
create table users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  name text not null default '',
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now()
);
create table profiles (
  user_id uuid primary key references users (id) on delete cascade,
  bio text, avatar_url text, github_username text,
  school text, level_of_study text, graduation_year int, country text,
  gender text,                                     -- optional
  timezone text not null default 'UTC',
  email_reminders boolean not null default true
);
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique
);
create table org_members (
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  primary key (org_id, user_id)
);
create table push_tokens (
  token text primary key,
  user_id uuid not null references users (id) on delete cascade,
  platform text not null,
  created_at timestamptz not null default now()
);
create table audit_log (
  id bigint generated always as identity primary key,
  event_id uuid,
  actor_id uuid references users (id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb, after jsonb,
  created_at timestamptz not null default now()
);
create table rate_limit_counters (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

-- Row-level security on, no client policies (Agent rule 6)
alter table users enable row level security;
alter table profiles enable row level security;
alter table organizations enable row level security;
alter table org_members enable row level security;
alter table push_tokens enable row level security;
alter table audit_log enable row level security;
alter table rate_limit_counters enable row level security;

-- The CIReN organization. Fixed id so code and seeds can refer to it.
insert into organizations (id, name, slug)
values ('00000000-0000-4000-8000-00000000c12e', 'CIReN', 'ciren');

-- New auth user -> one users row and one profiles row.
-- Name: the OAuth full name, falling back to the provider's name or username.
-- GitHub sign-ins also fill github_username; both providers fill avatar_url.
create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  provider text := coalesce(new.raw_app_meta_data ->> 'provider', '');
begin
  insert into public.users (id, email, name)
  values (
    new.id,
    lower(new.email),
    coalesce(
      nullif(btrim(meta ->> 'full_name'), ''),
      nullif(btrim(meta ->> 'name'), ''),
      nullif(btrim(meta ->> 'user_name'), ''),
      ''
    )
  );

  insert into public.profiles (user_id, avatar_url, github_username)
  values (
    new.id,
    nullif(meta ->> 'avatar_url', ''),
    case when provider = 'github' then nullif(meta ->> 'user_name', '') end
  );

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
