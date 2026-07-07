# Going live — runbook

Do these in order. Steps marked **(you)** need your accounts/credentials; I can't do
them for you. Everything else is already built.

---

## 0. Generate your secrets (once)
```bash
openssl rand -base64 32   # → TOKEN_ENC_KEY
openssl rand -hex 32      # → SYNC_SECRET
openssl rand -hex 32      # → AUTH_TOKEN
# pick your own APP_PASSCODE (the thing you'll type at /login)
```
Keep these somewhere safe; you'll paste them into Vercel and Postgres.

---

## 1. Supabase project **(you)**
1. Create a free project at supabase.com. Note the **Project URL**, **anon key**, and
   **service_role key** (Settings → API).
2. SQL editor — run migrations **in this order**:
   `0001_init` → `0003_nudge` → `0004_dashboard` → `0005_rls`.
   (Skip `0002_cron` for now — it needs your deployed URL. We run it in step 5.)
3. Storage → create two **private** buckets: `raw-emails` and `attachments`.

## 2. Google Cloud OAuth **(you)**
1. New OAuth client (type: **Web application**).
2. Scopes: `.../auth/gmail.readonly` and `.../auth/calendar.readonly`.
3. Authorized redirect URI: `https://YOUR-APP.vercel.app/api/auth/google/callback`
   (fill in once you know the Vercel URL — you can add it after step 3 and re-save).
4. OAuth consent screen → **Publish app** (production), yourself as sole user.
   This is what avoids the 7-day testing-mode refresh-token expiry.

## 3. Deploy to Vercel **(you)**
1. Push this repo to GitHub, import into Vercel (free Hobby is fine — cron runs from
   Supabase, not Vercel).
2. Add **Environment Variables** (from `.env.example`):
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `GOOGLE_REDIRECT_URI`, `TOKEN_ENC_KEY`, `SYNC_SECRET`, `APP_PASSCODE`, `AUTH_TOKEN`,
   and (optional) `RESEND_API_KEY` / `NUDGE_TO` / `NUDGE_FROM`.
3. Deploy. Note the URL, and go back to step 2.3 to set the redirect URI to match.

## 4. Seed config **(you)** — Supabase SQL editor
```sql
insert into my_addresses (email) values ('blakesutphen@gmail.com');  -- + any aliases/send-as
```

## 5. Wire up cron **(you)** — Supabase SQL editor
```sql
-- run migration 0002_cron now that you have a URL
-- then:
insert into cron_config (id, base_url, sync_secret)
  values (true, 'https://YOUR-APP.vercel.app', '<same value as SYNC_SECRET>');
```

## 6. Connect Google + first backfill
1. Visit `https://YOUR-APP.vercel.app` → enter your **APP_PASSCODE**.
2. Dashboard shows a "Connect Gmail + Calendar" banner → click it → consent.
3. Kick the first backfill manually (don't wait 15 min):
   ```bash
   curl -X POST https://YOUR-APP.vercel.app/api/sync/gmail    -H "Authorization: Bearer $SYNC_SECRET"
   curl -X POST https://YOUR-APP.vercel.app/api/sync/calendar -H "Authorization: Bearer $SYNC_SECRET"
   ```
   Gmail's 180-day backfill can take a few minutes.

## 7. Verify the data **before trusting the UI**
In Supabase, check row counts and spot-check correctness:
```sql
select count(*) from emails;
select count(*) from meetings;
select direction, count(*) from emails group by 1;   -- outbound should look right (your aliases)
select * from sync_state;                            -- needs_full_sync should be false, no last_error
select count(*) from emails where deal_id is null;   -- triage backlog
```
Then browse `/triage`, create a deal or two, and confirm the timeline + nudge panel populate.

---

## Launch checklist
- [ ] `/login` blocks access without the passcode (open an incognito window to confirm).
- [ ] `sync_state.needs_full_sync = false` and `last_error` is null after first sync.
- [ ] Direction detection correct — outbound emails from all your aliases show as `outbound`.
- [ ] `pg_cron` jobs listed: `select * from cron.job;`
- [ ] Nudge digest: either Resend env is set, or accept it's a logged no-op for now.
- [ ] Google shows "published/in production" — not "testing".

## If sync ever goes quiet
- `select * from sync_state;` → a `last_error` about history/token expiry means the next
  run auto-does a full re-sync (by design). If `needs_full_sync` is stuck true, hit the
  sync route manually.
- Token issues → revisit `/` and reconnect Google.
