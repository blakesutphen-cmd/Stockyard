-- ============================================================
-- Stockyard CRM — V1 schema
-- Postgres / Supabase
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ---------- ENUMS ----------
create type deal_stage as enum
  ('discovery','scope','demo','negotiation','close','closed_won','closed_lost');
create type email_direction as enum ('inbound','outbound');
create type meeting_status  as enum ('confirmed','cancelled');
create type activity_type   as enum
  ('email_in','email_out','meeting','note','stage_change','nudge','reassign');
create type sync_source     as enum ('gmail','gcal');

-- ============================================================
-- CONFIG (data, not hardcode) — seeded Day 1
-- ============================================================
create table app_settings (
  id         boolean primary key default true check (id),  -- one row only
  timezone   text not null default 'America/Denver',
  updated_at timestamptz not null default now()
);
insert into app_settings (id) values (true);

create table my_addresses (email text primary key);        -- lowercased

create table freemail_domains (domain text primary key);
insert into freemail_domains (domain) values
  ('gmail.com'),('yahoo.com'),('outlook.com'),('hotmail.com'),
  ('icloud.com'),('proton.me'),('protonmail.com'),('hey.com'),('aol.com');

create table meeting_kinds (
  kind            text primary key,
  label           text not null,
  default_minutes int,
  title_tokens    text[] not null default '{}'             -- matched case-insensitively
);
insert into meeting_kinds (kind, label, default_minutes, title_tokens) values
  ('discovery_call',       'Discovery Call',       30, array['[disc]','discovery']),
  ('demo_call',            'Demo Call',            45, array['[demo]','demo']),
  ('scoping_call',         'Scoping Call',         30, array['[scope]','scoping','scope']),
  ('architecture_planning','Architecture Planning',60, array['[arch]','architecture','planning']),
  ('other',                'Other',                null, array[]::text[]);

-- ============================================================
-- CORE
-- ============================================================
create table accounts (
  id         uuid primary key default uuid_generate_v4(),
  name       text,
  domain     text unique not null,
  tags       text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table contacts (
  id           uuid primary key default uuid_generate_v4(),
  account_id   uuid references accounts(id) on delete set null,
  email        text unique not null,
  name         text,
  title        text,
  linkedin_url text,
  tags         text[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on contacts (account_id);

create table deals (
  id                  uuid primary key default uuid_generate_v4(),
  account_id          uuid not null references accounts(id) on delete cascade,
  name                text not null,
  stage               deal_stage not null default 'discovery',
  value               numeric,
  owner_next_step     text,
  last_outbound_at    timestamptz,   -- trigger-maintained
  last_inbound_at     timestamptz,   -- trigger-maintained
  nudge_snoozed_until timestamptz,
  tags                text[] not null default '{}',
  closed_at           timestamptz,
  closed_reason       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on deals (account_id);
create index deals_open_idx on deals (stage)
  where stage not in ('closed_won','closed_lost');

create or replace function is_open(s deal_stage) returns boolean
  language sql immutable as $$ select s not in ('closed_won','closed_lost') $$;

create table emails (
  id               uuid primary key default uuid_generate_v4(),
  gmail_message_id text unique not null,
  gmail_thread_id  text,
  contact_id       uuid references contacts(id) on delete set null,
  deal_id          uuid references deals(id) on delete set null,
  direction        email_direction not null,
  subject          text,
  body_text        text,          -- quoted-reply stripped; regenerable from raw
  raw_storage_key  text,          -- raw .eml in Supabase Storage
  sent_at          timestamptz not null,
  has_attachments  boolean not null default false,
  created_at       timestamptz not null default now()
);
create index on emails (deal_id);
create index on emails (contact_id);
create index on emails (gmail_thread_id);
create index emails_unassigned_idx on emails (created_at) where deal_id is null;

create table meetings (
  id               uuid primary key default uuid_generate_v4(),
  gcal_event_id    text unique not null,
  deal_id          uuid references deals(id) on delete set null,
  meeting_kind     text not null default 'other' references meeting_kinds(kind),
  title            text,
  starts_at        timestamptz,
  ends_at          timestamptz,
  attendee_emails  text[] not null default '{}',
  status           meeting_status not null default 'confirmed',
  fathom_recap_url text,          -- V2
  fathom_summary   text,          -- V2
  created_at       timestamptz not null default now()
);
create index on meetings (deal_id);
create index on meetings (starts_at);
create index meetings_unassigned_idx on meetings (created_at) where deal_id is null;

create table activities (
  id          uuid primary key default uuid_generate_v4(),
  deal_id     uuid not null references deals(id) on delete cascade,
  type        activity_type not null,
  ref_id      uuid,
  occurred_at timestamptz not null,
  summary     text,
  created_at  timestamptz not null default now(),
  unique (type, ref_id)
);
create index on activities (deal_id, occurred_at desc);

-- ============================================================
-- SYNC + AUTH
-- ============================================================
create table sync_state (
  source          sync_source primary key,
  cursor          text,                         -- gmail historyId / gcal syncToken
  last_synced_at  timestamptz,
  needs_full_sync boolean not null default true,
  last_error      text
);
insert into sync_state (source, needs_full_sync) values ('gmail',true),('gcal',true);

create table google_oauth (
  id                   boolean primary key default true check (id),  -- single user
  refresh_token_enc    bytea not null,
  access_token_enc     bytea,
  access_token_expires timestamptz,
  scopes               text[] not null,
  connected_at         timestamptz not null default now(),
  last_refresh_at      timestamptz,
  refresh_expected_by  timestamptz
);

-- ============================================================
-- TRIGGERS
-- ============================================================
create or replace function touch_updated_at() returns trigger
  language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger t_accounts_touch before update on accounts
  for each row execute function touch_updated_at();
create trigger t_contacts_touch before update on contacts
  for each row execute function touch_updated_at();
create trigger t_deals_touch before update on deals
  for each row execute function touch_updated_at();

-- Recompute deal.last_inbound/outbound from emails (both sides on reassign).
create or replace function recompute_deal_times(p_deal uuid) returns void
  language sql as $$
  update deals d set
    last_inbound_at = (select max(sent_at) from emails
                       where deal_id = p_deal and direction = 'inbound'),
    last_outbound_at = (select max(sent_at) from emails
                        where deal_id = p_deal and direction = 'outbound')
  where d.id = p_deal;
$$;

create or replace function emails_recompute_trigger() returns trigger
  language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.deal_id is distinct from old.deal_id then
    if old.deal_id is not null then perform recompute_deal_times(old.deal_id); end if;
    if new.deal_id is not null then perform recompute_deal_times(new.deal_id); end if;
  elsif new.deal_id is not null then
    perform recompute_deal_times(new.deal_id);
  end if;
  return null;
end $$;
create trigger t_emails_recompute
  after insert or update of deal_id, direction, sent_at on emails
  for each row execute function emails_recompute_trigger();

-- Auto-write timeline activities when an email/meeting gets a deal.
-- Idempotent via unique(type, ref_id); reassignment moves the activity.
create or replace function emails_activity_trigger() returns trigger
  language plpgsql as $$
begin
  if new.deal_id is not null then
    insert into activities (deal_id, type, ref_id, occurred_at, summary)
    values (new.deal_id,
            (case when new.direction='inbound' then 'email_in' else 'email_out' end)::activity_type,
            new.id, new.sent_at, coalesce(new.subject,'(no subject)'))
    on conflict (type, ref_id) do update set deal_id = excluded.deal_id;
  end if;
  return null;
end $$;
create trigger t_emails_activity after insert or update of deal_id on emails
  for each row execute function emails_activity_trigger();

create or replace function meetings_activity_trigger() returns trigger
  language plpgsql as $$
begin
  if new.deal_id is not null and new.status = 'confirmed' then
    insert into activities (deal_id, type, ref_id, occurred_at, summary)
    values (new.deal_id, 'meeting', new.id, coalesce(new.starts_at, now()),
            coalesce(new.title,'(meeting)'))
    on conflict (type, ref_id) do update set deal_id = excluded.deal_id;
  end if;
  return null;
end $$;
create trigger t_meetings_activity after insert or update of deal_id, status on meetings
  for each row execute function meetings_activity_trigger();

-- ============================================================
-- RE-RESOLUTION PASS (idempotent, re-runnable)
-- ============================================================
create or replace function resolve_account_deals(p_account uuid)
  returns void language plpgsql as $$
declare v_deal uuid; v_open int;
begin
  select count(*), min(id) into v_open, v_deal
  from deals where account_id = p_account and is_open(stage);

  if v_open <> 1 then return; end if;   -- 0 or >1 open deals → leave in triage

  update emails e set deal_id = v_deal
  where e.deal_id is null
    and e.contact_id in (select id from contacts where account_id = p_account);

  update meetings m set deal_id = v_deal
  where m.deal_id is null
    and exists (select 1 from contacts c
                where c.account_id = p_account
                  and lower(c.email) = any (select lower(x) from unnest(m.attendee_emails) x));
end $$;

create or replace function deals_resolve_trigger() returns trigger
  language plpgsql as $$
begin
  if tg_op = 'INSERT' or (is_open(new.stage) and not is_open(old.stage)) then
    perform resolve_account_deals(new.account_id);
  end if;
  return null;
end $$;
create trigger t_deals_resolve after insert or update of stage on deals
  for each row execute function deals_resolve_trigger();
