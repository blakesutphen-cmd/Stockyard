# Stockyard CRM — V1

Single-user CRM: Gmail + Google Calendar sync → GTMO deals → weekly dashboard + 7-day nudge.
Next.js (App Router) · Supabase (Postgres + Storage) · Google OAuth (published-prod).

## What's scaffolded here

```
supabase/migrations/
  0001_init.sql     schema, triggers, re-resolution pass
  0002_cron.sql     pg_cron + pg_net → calls the API routes
  0003_nudge.sql    deals_needing_nudge() function
src/lib/
  supabase.ts       service-role client (server only)
  crypto.ts         AES-256-GCM token encryption
  config.ts         my_addresses / freemail / timezone / meeting_kinds loaders
  http.ts           SYNC_SECRET guard for cron routes
  google/auth.ts    OAuth consent, token store, authed client w/ refresh
  sync/parse.ts     address parsing, MIME body walk, quoted-reply strip, kind classify
  sync/store.ts     idempotent upserts + resolution/cursor helpers
  sync/gmail.ts     backfill + incremental history + 404/410 fallback
  sync/calendar.ts  syncToken sync + 410 fallback
  nudge.ts          digest email + nudge activities
src/app/api/
  auth/google/[callback]   OAuth flow
  sync/gmail | sync/calendar | nudge   cron-triggered jobs
```

## Setup order

1. **Supabase project** (free tier). In the SQL editor run `0001`, then `0003`, then `0002`.
2. **Storage buckets** — create two private buckets: `raw-emails` and `attachments`.
3. **Google Cloud** — OAuth client (Web), scopes `gmail.readonly` + `calendar.readonly`,
   redirect URI = `https://YOUR-APP/api/auth/google/callback`. **Publish the app to
   production** with yourself as the sole user (avoids the 7-day testing-mode token expiry).
4. **Env** — copy `.env.example` → `.env.local`, fill it in.
   `openssl rand -base64 32` → `TOKEN_ENC_KEY`; `openssl rand -hex 32` → `SYNC_SECRET`.
5. **Seed config** in SQL:
   ```sql
   insert into my_addresses (email) values ('blakesutphen@gmail.com');  -- + any aliases
   insert into cron_config (id, base_url, sync_secret)
     values (true, 'https://YOUR-APP.vercel.app', 'SAME-AS-SYNC_SECRET');
   ```
6. **Deploy** to Vercel (Hobby is fine — cron runs from Supabase, not Vercel).
7. **Connect Google** — visit `/`, click Connect. First Gmail sync backfills 180 days
   (slow; the route allows 300s).

## Manual test before wiring cron

```bash
curl -X POST https://YOUR-APP/api/sync/gmail    -H "Authorization: Bearer $SYNC_SECRET"
curl -X POST https://YOUR-APP/api/sync/calendar -H "Authorization: Bearer $SYNC_SECRET"
curl -X POST https://YOUR-APP/api/nudge         -H "Authorization: Bearer $SYNC_SECRET"
```
Then verify rows land in `emails`, `contacts`, `accounts`, `meetings`, `activities`
**before** building any UI (sync correctness is 80% of the work).

## Deliberately not built yet
Dashboard screens (Day 10–11), deal CRUD/triage UI (Day 8–9), Supabase magic-link login
gate, Fathom webhook (V2), LLM retrieval (V3). Nudge email needs Resend env
(`RESEND_API_KEY`, `NUDGE_TO`, `NUDGE_FROM`) or it's a logged no-op.

## Notes / TODO baked into the code
- `sync/parse.ts` `stripQuotedReply` is a heuristic — swap for `email-reply-parser`/`talon`.
  Raw `.eml` is kept in Storage so `body_text` is regenerable without re-syncing.
- Put the Supabase auth check in front of `/api/auth/google` before shipping.
- Enable **RLS** on every table (single-user, but tables are internet-reachable).
