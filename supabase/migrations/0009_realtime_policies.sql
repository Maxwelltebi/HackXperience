-- 0009_realtime_policies
-- Who may receive which private realtime channel (DESIGN Step 6 part 4). These are the only
-- client policies in the database (Agent rule 6): clients never read or write public tables,
-- and they can only receive broadcasts, never send them (no insert policy).
--
--   event:{id}:staff          owner, admin
--   event:{id}:mentors        mentors, admins (and owners)
--   event:{id}:announcements  anyone at the event: staff and confirmed participants
--   team:{id}                 that team's members
--   user:{id}                 that user
--
-- The helpers live in hx_private, a schema the Data API doesn't expose, so nobody can call
-- them over HTTP to probe who is staff where. Do not edit after it has run.

create schema if not exists hx_private;
revoke all on schema hx_private from public;
grant usage on schema hx_private to authenticated;

create or replace function hx_private.is_event_staff(p_event_id uuid, p_user_id uuid, p_roles public.staff_role[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.event_staff s
    where s.event_id = p_event_id and s.user_id = p_user_id and s.role = any (p_roles)
  )
$$;

create or replace function hx_private.is_team_member(p_team_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.team_members m
    join public.teams t on t.id = m.team_id and t.deleted_at is null
    where m.team_id = p_team_id and m.user_id = p_user_id
  )
$$;

create or replace function hx_private.is_event_participant(p_event_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.applications a
    where a.event_id = p_event_id and a.user_id = p_user_id and a.status = 'confirmed'
  )
$$;

/** Whether `p_user_id` may receive broadcasts on `p_topic`. Unknown topics: never. */
create or replace function hx_private.can_receive(p_topic text, p_user_id uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  parts text[];
  target uuid;
begin
  if p_topic is null or p_user_id is null then
    return false;
  end if;
  parts := string_to_array(p_topic, ':');
  begin
    target := parts[2]::uuid;
  exception when others then
    return false;
  end;
  if parts[1] = 'user' and cardinality(parts) = 2 then
    return target = p_user_id;
  elsif parts[1] = 'team' and cardinality(parts) = 2 then
    return hx_private.is_team_member(target, p_user_id);
  elsif parts[1] = 'event' and cardinality(parts) = 3 then
    if parts[3] = 'staff' then
      return hx_private.is_event_staff(target, p_user_id, array['owner', 'admin']::public.staff_role[]);
    elsif parts[3] = 'mentors' then
      return hx_private.is_event_staff(target, p_user_id, array['owner', 'admin', 'mentor']::public.staff_role[]);
    elsif parts[3] = 'announcements' then
      return hx_private.is_event_staff(
               target, p_user_id,
               array['owner', 'admin', 'judge', 'mentor', 'volunteer']::public.staff_role[])
             or hx_private.is_event_participant(target, p_user_id);
    end if;
  end if;
  return false;
end
$$;

revoke all on function hx_private.is_event_staff(uuid, uuid, public.staff_role[]) from public;
revoke all on function hx_private.is_team_member(uuid, uuid) from public;
revoke all on function hx_private.is_event_participant(uuid, uuid) from public;
revoke all on function hx_private.can_receive(text, uuid) from public;
grant execute on function hx_private.can_receive(text, uuid) to authenticated;

do $migration$
begin
  if to_regclass('realtime.messages') is null then
    raise notice '0009_realtime_policies: realtime.messages not found; policy skipped';
    return;
  end if;
  execute 'drop policy if exists "hx: receive broadcasts on allowed channels" on realtime.messages';
  execute $policy$
    create policy "hx: receive broadcasts on allowed channels"
    on realtime.messages for select to authenticated
    using (
      extension = 'broadcast'
      and hx_private.can_receive((select realtime.topic()), (select auth.uid()))
    )
  $policy$;
end
$migration$;
