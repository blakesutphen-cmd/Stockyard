-- ============================================================
-- Lock every table with RLS. No policies = no access for the anon or
-- authenticated roles. The app reaches data only through the service-role
-- key (server-side), which bypasses RLS. Defense in depth: even though the
-- passcode gate fronts the UI, the Postgres REST endpoint is internet-facing.
-- ============================================================
alter table app_settings     enable row level security;
alter table my_addresses     enable row level security;
alter table freemail_domains enable row level security;
alter table meeting_kinds    enable row level security;
alter table accounts         enable row level security;
alter table contacts         enable row level security;
alter table deals            enable row level security;
alter table emails           enable row level security;
alter table meetings         enable row level security;
alter table activities       enable row level security;
alter table sync_state       enable row level security;
alter table google_oauth     enable row level security;

-- cron_config is created in 0002; guard in case migrations run out of order.
do $$
begin
  if to_regclass('public.cron_config') is not null then
    execute 'alter table cron_config enable row level security';
  end if;
end $$;
