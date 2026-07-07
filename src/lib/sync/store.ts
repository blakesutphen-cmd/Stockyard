import { admin } from "../supabase";
import { freemailDomains } from "../config";
import { domainOf, type Addr } from "./parse";

/** Upsert an account by domain (skips freemail). Returns account id or null. */
export async function upsertAccount(domain: string): Promise<string | null> {
  const free = await freemailDomains();
  if (free.has(domain)) return null;
  const { data, error } = await admin
    .from("accounts")
    .upsert({ domain, name: domain }, { onConflict: "domain" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** Upsert a contact by lowercased email, linking to its account. Returns contact id. */
export async function upsertContact(addr: Addr): Promise<string> {
  const domain = domainOf(addr.email);
  const accountId = await upsertAccount(domain);
  const row: Record<string, unknown> = { email: addr.email };
  if (addr.name) row.name = addr.name;
  if (accountId) row.account_id = accountId;
  const { data, error } = await admin
    .from("contacts")
    .upsert(row, { onConflict: "email", ignoreDuplicates: false })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export type EmailRow = {
  gmail_message_id: string;
  gmail_thread_id: string | null;
  contact_id: string | null;
  direction: "inbound" | "outbound";
  subject: string | null;
  body_text: string | null;
  raw_storage_key: string | null;
  sent_at: string;
  has_attachments: boolean;
};

/** Upsert an email by gmail_message_id (dedup). deal_id is left to resolution. */
export async function upsertEmail(row: EmailRow): Promise<void> {
  const { error } = await admin
    .from("emails")
    .upsert(row, { onConflict: "gmail_message_id", ignoreDuplicates: true });
  if (error) throw error;
}

export type MeetingRow = {
  gcal_event_id: string;
  meeting_kind: string;
  title: string | null;
  starts_at: string | null;
  ends_at: string | null;
  attendee_emails: string[];
  status: "confirmed" | "cancelled";
};

export async function upsertMeeting(row: MeetingRow): Promise<void> {
  const { error } = await admin
    .from("meetings")
    .upsert(row, { onConflict: "gcal_event_id", ignoreDuplicates: false });
  if (error) throw error;
}

/** Re-run the idempotent single-open-deal resolution for a set of accounts. */
export async function resolveAccounts(accountIds: Iterable<string>): Promise<void> {
  for (const id of new Set(accountIds)) {
    const { error } = await admin.rpc("resolve_account_deals", { p_account: id });
    if (error) throw error;
  }
}

export async function readCursor(source: "gmail" | "gcal") {
  const { data } = await admin
    .from("sync_state")
    .select("cursor, needs_full_sync")
    .eq("source", source)
    .single();
  return { cursor: data?.cursor ?? null, needsFull: data?.needs_full_sync ?? true };
}

export async function writeCursor(
  source: "gmail" | "gcal",
  cursor: string | null,
  opts: { needsFull?: boolean; error?: string | null } = {}
) {
  await admin
    .from("sync_state")
    .update({
      cursor,
      last_synced_at: new Date().toISOString(),
      needs_full_sync: opts.needsFull ?? false,
      last_error: opts.error ?? null,
    })
    .eq("source", source);
}

/** Flag a source for a full re-sync (called when a cursor is rejected). */
export async function flagFullSync(source: "gmail" | "gcal", error: string) {
  await admin
    .from("sync_state")
    .update({ needs_full_sync: true, last_error: error })
    .eq("source", source);
}
