-- Deals that need a touch: you spoke last, 7+ days ago, open, not snoozed.
-- Exposed as a function so the app can call it via supabase.rpc().
create or replace function deals_needing_nudge()
  returns setof deals language sql stable as $$
  select d.*
  from deals d
  where is_open(d.stage)
    and d.last_outbound_at is not null
    and d.last_outbound_at > coalesce(d.last_inbound_at, '-infinity'::timestamptz)
    and d.last_outbound_at < now() - interval '7 days'
    and (d.nudge_snoozed_until is null or d.nudge_snoozed_until < now())
  order by d.last_outbound_at asc;
$$;
