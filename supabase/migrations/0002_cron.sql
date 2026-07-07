-- ============================================================
-- Cron jobs — pg_cron + pg_net call the Next.js API routes.
-- (Supabase free tier; NOT Vercel cron.)
-- ============================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Where to reach the deployed app + the shared secret the routes check.
-- For production, move the secret into Supabase Vault instead of a table.
create table if not exists cron_config (
  id          boolean primary key default true check (id),
  base_url    text not null,   -- e.g. https://stockyard.vercel.app
  sync_secret text not null    -- must match SYNC_SECRET env in the app
);
alter table cron_config enable row level security;  -- service-role only
-- INSERT your values once, e.g.:
-- insert into cron_config (id, base_url, sync_secret)
--   values (true, 'https://YOUR-APP.vercel.app', 'YOUR-LONG-RANDOM-SECRET');

create or replace function trigger_route(p_path text) returns void
  language plpgsql as $$
declare cfg cron_config;
begin
  select * into cfg from cron_config where id;
  if not found then raise notice 'cron_config not set'; return; end if;
  perform net.http_post(
    url     := cfg.base_url || p_path,
    headers := jsonb_build_object(
                 'Content-Type','application/json',
                 'Authorization','Bearer ' || cfg.sync_secret),
    body    := '{}'::jsonb
  );
end $$;

-- Incremental sync every 15 minutes.
select cron.schedule('stockyard-gmail-sync',    '*/15 * * * *',
                     $$ select trigger_route('/api/sync/gmail') $$);
select cron.schedule('stockyard-calendar-sync', '*/15 * * * *',
                     $$ select trigger_route('/api/sync/calendar') $$);

-- Nudge daily at 07:00 America/Denver.  pg_cron runs in UTC, so 07:00 MT =
-- 13:00 UTC (MDT) / 14:00 UTC (MST). Using 13:00 UTC; the route re-checks the
-- 7-day window in app_settings.timezone, so an hour of DST slop is harmless.
select cron.schedule('stockyard-nudge', '0 13 * * *',
                     $$ select trigger_route('/api/nudge') $$);

-- To remove: select cron.unschedule('stockyard-gmail-sync');
