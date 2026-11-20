-- 0004_cron
-- Calls POST /api/internal/tick every minute with pg_cron and pg_net.
-- The URL and secret live in Supabase Vault, never in this file. A person creates them once:
--
--   select vault.create_secret('https://hack.ciren.network/api/internal/tick', 'hx_tick_url');
--   select vault.create_secret('<the TICK_SECRET value from Vercel>', 'hx_tick_secret');
--
-- Until both secrets exist the job runs and does nothing.
-- On a Postgres without pg_cron, pg_net or Vault (the no-Docker test database) this migration
-- only prints a notice, so tests still run.
-- Do not edit after it has run.

do $migration$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net')
     or not exists (select 1 from pg_namespace where nspname = 'vault') then
    raise notice '0004_cron: pg_cron, pg_net or vault not available; tick schedule skipped';
    return;
  end if;

  create extension if not exists pg_cron with schema pg_catalog;
  create extension if not exists pg_net with schema extensions;

  perform cron.schedule(
    'hx-tick',
    '* * * * *',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'hx_tick_url'),
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'x-tick-secret',
          (select decrypted_secret from vault.decrypted_secrets where name = 'hx_tick_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 55000
      )
      where exists (select 1 from vault.decrypted_secrets where name = 'hx_tick_url')
        and exists (select 1 from vault.decrypted_secrets where name = 'hx_tick_secret');
    $job$
  );
end
$migration$;
