-- 0011_staff_invites
-- Staff invitations for people with no account yet (R39, approved 21 Nov 2026). Additive only.
-- An owner adds an email and a role; if nobody has that email, the role waits here and the
-- person gets an invitation email. Their first sign-in turns the invite into an event_staff row.
-- Do not edit after it has run.

create table staff_invites (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  email text not null check (email = lower(email)),
  role staff_role not null,
  invited_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  unique (event_id, email, role)
);
create index on staff_invites (email);

-- Agent rule 6: RLS on, no client policies.
alter table staff_invites enable row level security;

-- Invitation emails go to people who have no users row yet: their outbox row has no user_id,
-- and the address is read from the invite at send time. Every other template still names a user.
alter table notification_outbox alter column user_id drop not null;
alter table notification_outbox add constraint notification_outbox_has_recipient
  check (user_id is not null or template = 'staff_invite');

-- A new users row (first sign-in) claims every invite for its email: the roles are added, each
-- is audited, and the invites are removed. Runs after handle_new_auth_user() inserts the row.
create function public.claim_staff_invites()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.event_staff (event_id, user_id, role)
  select i.event_id, new.id, i.role
  from public.staff_invites i
  join public.events e on e.id = i.event_id and e.deleted_at is null
  where i.email = new.email
  on conflict do nothing;

  insert into public.audit_log (event_id, actor_id, action, entity_type, entity_id, before, after)
  select i.event_id, new.id, 'staff.invite_accepted', 'event_staff', new.id,
         jsonb_build_object('invite_id', i.id),
         jsonb_build_object('role', i.role, 'invited_by', i.invited_by)
  from public.staff_invites i
  where i.email = new.email;

  delete from public.staff_invites where email = new.email;
  return new;
end;
$$;

revoke all on function public.claim_staff_invites() from public, anon, authenticated;

create trigger on_user_created_claim_staff_invites
  after insert on public.users
  for each row execute function public.claim_staff_invites();
