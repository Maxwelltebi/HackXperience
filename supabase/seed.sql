-- Local test data. Applied after migrations by `pnpm db:reset`.
-- Auth users are inserted directly; the on_auth_user_created trigger creates
-- their users and profiles rows. They cannot sign in (OAuth only); they exist
-- so pages and endpoints have data to show.

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
values
  ('11111111-1111-4111-8111-111111111111', 'ama.mensah@example.com',
   '{"full_name": "Ama Mensah", "user_name": "amamensah"}', '{"provider": "github"}'),
  ('22222222-2222-4222-8222-222222222222', 'efua.owusu@example.com',
   '{"full_name": "Efua Owusu"}', '{"provider": "google"}'),
  ('33333333-3333-4333-8333-333333333333', 'kwame.b@example.com',
   '{"name": "Kwame Boateng"}', '{"provider": "google"}');

update profiles
set school = 'University of Ghana', level_of_study = 'Undergraduate', graduation_year = 2028,
    country = 'Ghana', timezone = 'Africa/Accra'
where user_id = '11111111-1111-4111-8111-111111111111';

-- Kwame is a CIReN organizer.
insert into org_members (org_id, user_id)
values ('00000000-0000-4000-8000-00000000c12e', '33333333-3333-4333-8333-333333333333');
