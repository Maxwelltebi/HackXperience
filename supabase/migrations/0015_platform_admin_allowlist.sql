-- 0015_platform_admin_allowlist
-- Platform admins are a fixed list of at most two email addresses (R44, product owner, 23 Nov 2026).
-- Nobody can become one through the app: users.is_platform_admin is now set only by the trigger
-- below, from this list, and only for an account whose email the sign-in provider confirmed and
-- that signed in with Google or GitHub. Setting the column by hand is overwritten. Changing the
-- list takes database access (the SQL editor); nothing in the app writes to it.
--
-- The repository is public, so personal addresses are never written here: the dev project's
-- existing admin is carried over from the database, and on a new project the second address is
-- added in the SQL editor (docs/PROGRESS.md, R44).

create table platform_admin_emails (
  email text primary key check (email = lower(email) and email like '%_@_%'),
  added_at timestamptz not null default now()
);

-- Agent rule 6: RLS on, no client policies.
alter table platform_admin_emails enable row level security;

-- At most two.
create or replace function hx_private.limit_platform_admins()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  lock table public.platform_admin_emails in share row exclusive mode;
  if (select count(*) from public.platform_admin_emails) >= 2 then
    raise exception 'There can be at most two platform admins. Remove one first.';
  end if;
  return new;
end;
$$;

create trigger platform_admin_emails_limit
  before insert on platform_admin_emails
  for each row execute function hx_private.limit_platform_admins();

-- users.is_platform_admin follows the list, whatever an insert or update tries to set.
create or replace function hx_private.derive_platform_admin()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.is_platform_admin := exists (
    select 1
    from public.platform_admin_emails a
    join auth.users au on au.id = new.id
    where a.email = lower(new.email)
      and au.email_confirmed_at is not null
      and coalesce(au.raw_app_meta_data ->> 'provider', '') in ('google', 'github')
  );
  return new;
end;
$$;

create trigger users_derive_platform_admin
  before insert or update on users
  for each row execute function hx_private.derive_platform_admin();

-- Adding or removing an address updates the matching account straight away.
create or replace function hx_private.resync_platform_admin()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.users set is_platform_admin = is_platform_admin
  where lower(email) in (lower(coalesce(new.email, '')), lower(coalesce(old.email, '')));
  return null;
end;
$$;

create trigger platform_admin_emails_resync
  after insert or delete or update on platform_admin_emails
  for each row execute function hx_private.resync_platform_admin();

revoke all on function hx_private.limit_platform_admins() from public;
revoke all on function hx_private.derive_platform_admin() from public;
revoke all on function hx_private.resync_platform_admin() from public;

-- The list: the existing admin (set on the dev project before this migration), then CIReN's
-- shared address, which becomes an admin the first time it signs in with Google.
insert into platform_admin_emails (email)
select lower(email) from users where is_platform_admin order by created_at limit 1;

insert into platform_admin_emails (email)
values ('admin.cirenet@gmail.com')
on conflict (email) do nothing;

-- Recompute every account against the list (clears any flag set by hand).
update users set is_platform_admin = is_platform_admin;
