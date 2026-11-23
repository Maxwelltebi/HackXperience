-- 0014_platform_admins
-- Platform admins (users.is_platform_admin, from 0001) have owner rights at every event (R43,
-- answering Q10; approved by the product owner on 23 Nov 2026). The API gives them owner in
-- loadEventRoles; this gives them the owner's Realtime channels too. Replaces the 0009 function
-- with the same signature: everything that passed before still passes.

create or replace function hx_private.is_event_staff(p_event_id uuid, p_user_id uuid, p_roles public.staff_role[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.event_staff s
    where s.event_id = p_event_id and s.user_id = p_user_id and s.role = any (p_roles)
  )
  or (
    'owner' = any (p_roles)
    and exists (select 1 from public.users u where u.id = p_user_id and u.is_platform_admin)
  )
$$;

revoke all on function hx_private.is_event_staff(uuid, uuid, public.staff_role[]) from public;
