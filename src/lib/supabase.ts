import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client for server-side sync/nudge work. Bypasses RLS, so it must
 * never be imported into client components.
 *
 * Constructed lazily via a Proxy so that merely importing this module (e.g.
 * during `next build`'s page-data collection) doesn't require live secrets —
 * the client is only created on first actual use, at request time.
 */
let _client: SupabaseClient | null = null;

function client(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set");
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

export const admin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const c = client();
    const value = (c as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? value.bind(c) : value;
  },
});
