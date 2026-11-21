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

-- A published demo event with applications open, owned by Kwame.
insert into events (
  id, organization_id, name, slug, description, timezone, mode, location, status,
  applications_open_at, applications_close_at, starts_at, submission_deadline, ends_at,
  team_size_min, team_size_max, max_tracks_per_submission, application_questions
) values (
  '55555555-5555-4555-8555-555555555555', '00000000-0000-4000-8000-00000000c12e',
  'The CIReN Experience 5.0', 'the-ciren-experience-5-0',
  E'CIReN''s next hackathon. Build something useful in a weekend with a team.\n\nBring a laptop and a charger. Meals are provided.',
  'Africa/Accra', 'in_person', 'University of Ghana, Legon', 'published',
  now() - interval '3 days', now() + interval '10 days',
  now() + interval '14 days', now() + interval '15 days', now() + interval '15 days 6 hours',
  1, 4, 2,
  '[{"id":"why","type":"long_text","label":"Why do you want to attend?","required":true},
    {"id":"github","type":"url","label":"GitHub profile","required":false},
    {"id":"track","type":"single_choice","label":"Track interest","required":true,"options":["Health","FinTech","Education","Open"]}]'
);
insert into event_staff (event_id, user_id, role) values
  ('55555555-5555-4555-8555-555555555555', '33333333-3333-4333-8333-333333333333', 'owner');
insert into tracks (event_id, name, description) values
  ('55555555-5555-4555-8555-555555555555', 'Health', 'Tools for clinics, patients and community health workers'),
  ('55555555-5555-4555-8555-555555555555', 'FinTech', 'Payments, savings and credit'),
  ('55555555-5555-4555-8555-555555555555', 'Education', 'Learning in and out of school'),
  ('55555555-5555-4555-8555-555555555555', 'Open', 'Anything else');
insert into schedule_items (event_id, title, starts_at, location) values
  ('55555555-5555-4555-8555-555555555555', 'Check-in and breakfast', now() + interval '14 days', 'Main entrance'),
  ('55555555-5555-4555-8555-555555555555', 'Opening and team formation', now() + interval '14 days 1 hour', 'Hall A');
insert into applications (event_id, user_id, answers, created_at) values
  ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111',
   '{"why":"I build small tools for my hall''s clinic and want to ship a full product in a weekend.","github":"https://github.com/amamensah","track":"Health"}',
   now() - interval '2 days'),
  ('55555555-5555-4555-8555-555555555555', '22222222-2222-4222-8222-222222222222',
   '{"why":"I want to learn how to work on a team under a deadline.","track":"FinTech"}',
   now() - interval '1 day');

-- Ama accepted and confirmed (ticket code below), on team ClinicQ with invite code K7QMX4PR.
update applications
set status = 'confirmed', ticket_code = 'seed-ticket-ama-mensah-0001',
    decided_by = '33333333-3333-4333-8333-333333333333', decided_at = now() - interval '1 day'
where event_id = '55555555-5555-4555-8555-555555555555'
  and user_id = '11111111-1111-4111-8111-111111111111';
insert into teams (id, event_id, name, invite_code, owner_id, looking_for_members, looking_for)
values ('66666666-6666-4666-8666-666666666666', '55555555-5555-4555-8555-555555555555',
        'ClinicQ', 'K7QMX4PR', '11111111-1111-4111-8111-111111111111', true, 'A designer');
insert into team_members (team_id, event_id, user_id)
values ('66666666-6666-4666-8666-666666666666', '55555555-5555-4555-8555-555555555555',
        '11111111-1111-4111-8111-111111111111');
