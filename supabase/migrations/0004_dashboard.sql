-- ============================================================
-- Dashboard aggregates. Week/quarter boundaries are computed in the app
-- timezone (app_settings.timezone), not UTC.
-- ============================================================

-- Confirmed meetings this week (Mon–Sun, local), counted per kind.
create or replace function dashboard_meetings_this_week()
  returns table(kind text, label text, cnt bigint)
  language plpgsql stable as $$
declare tz text;
begin
  select timezone into tz from app_settings where id;
  return query
    select mk.kind, mk.label, count(m.id)
    from meeting_kinds mk
    left join meetings m
      on m.meeting_kind = mk.kind
     and m.status = 'confirmed'
     and (m.starts_at at time zone tz) >= date_trunc('week', (now() at time zone tz))
     and (m.starts_at at time zone tz) <  date_trunc('week', (now() at time zone tz)) + interval '7 days'
    where mk.kind <> 'other'
    group by mk.kind, mk.label, mk.default_minutes
    order by mk.default_minutes nulls last, mk.label;
end $$;

-- Pipeline: open stages counted in full; closed stages counted for the
-- current quarter only.
create or replace function dashboard_pipeline()
  returns table(stage text, deal_count bigint, total_value numeric, closed boolean)
  language plpgsql stable as $$
declare tz text; q_start timestamptz;
begin
  select timezone into tz from app_settings where id;
  q_start := (date_trunc('quarter', (now() at time zone tz)))::timestamp at time zone tz;
  return query
    select d.stage::text, count(*)::bigint, coalesce(sum(d.value), 0), false
    from deals d
    where is_open(d.stage)
    group by d.stage
    union all
    select d.stage::text, count(*)::bigint, coalesce(sum(d.value), 0), true
    from deals d
    where not is_open(d.stage) and d.closed_at >= q_start
    group by d.stage;
end $$;
