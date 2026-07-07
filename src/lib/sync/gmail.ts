import { google, gmail_v1 } from "googleapis";
import { authedClient } from "../google/auth";
import { admin } from "../supabase";
import { myAddresses } from "../config";
import { parseAddresses, extractBody, listAttachments, domainOf } from "./parse";
import {
  upsertContact,
  upsertEmail,
  resolveAccounts,
  readCursor,
  writeCursor,
  flagFullSync,
  type EmailRow,
} from "./store";

const BACKFILL_QUERY = "newer_than:180d";
const ATTACH_BUCKET = "attachments";
const RAW_BUCKET = "raw-emails";
// Skip signature logos / tracking pixels / calendar invites.
const SKIP_MIME = /^image\//;
const SKIP_MIN_IMAGE_BYTES = 50_000;
const SKIP_EXT = /\.(ics)$/i;

type Gmail = gmail_v1.Gmail;

export async function syncGmail(): Promise<{ processed: number; mode: string }> {
  const auth = await authedClient();
  const gmail = google.gmail({ version: "v1", auth });
  const { cursor, needsFull } = await readCursor("gmail");

  let ids: string[];
  let mode: string;
  try {
    if (needsFull || !cursor) {
      ids = await listBackfillIds(gmail);
      mode = "full";
    } else {
      ids = await listHistoryIds(gmail, cursor);
      mode = "incremental";
    }
  } catch (e: any) {
    // historyId too old → 404; syncToken gone → 410. Fall back to full re-sync.
    if (e?.code === 404 || e?.code === 410) {
      await flagFullSync("gmail", `history expired (${e.code}); full re-sync queued`);
      return { processed: 0, mode: "reset-to-full" };
    }
    throw e;
  }

  const touchedAccounts = new Set<string>();
  let processed = 0;
  for (const id of ids) {
    const account = await processMessage(gmail, id);
    if (account) touchedAccounts.add(account);
    processed++;
  }
  await resolveAccounts(touchedAccounts);

  // Record the newest historyId as the next cursor.
  const profile = await gmail.users.getProfile({ userId: "me" });
  await writeCursor("gmail", String(profile.data.historyId), { needsFull: false });
  return { processed, mode };
}

async function listBackfillIds(gmail: Gmail): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const res = await gmail.users.messages.list({
      userId: "me",
      q: BACKFILL_QUERY,
      maxResults: 500,
      pageToken,
    });
    (res.data.messages ?? []).forEach((m) => m.id && ids.push(m.id));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return ids;
}

async function listHistoryIds(gmail: Gmail, startHistoryId: string): Promise<string[]> {
  const ids = new Set<string>();
  let pageToken: string | undefined;
  do {
    const res = await gmail.users.history.list({
      userId: "me",
      startHistoryId,
      historyTypes: ["messageAdded"],
      pageToken,
    });
    for (const h of res.data.history ?? []) {
      for (const m of h.messagesAdded ?? []) {
        if (m.message?.id) ids.add(m.message.id);
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return [...ids];
}

/** Fetch, parse, and store one message. Returns the counterparty account id (if any). */
async function processMessage(gmail: Gmail, id: string): Promise<string | null> {
  const res = await gmail.users.messages.get({ userId: "me", id, format: "full" });
  const msg = res.data;
  const headers = new Map(
    (msg.payload?.headers ?? []).map((h) => [h.name?.toLowerCase() ?? "", h.value ?? ""])
  );

  const from = parseAddresses(headers.get("from"));
  const to = parseAddresses(
    [headers.get("to"), headers.get("cc")].filter(Boolean).join(",")
  );
  const mine = await myAddresses();
  const fromMe = from.some((a) => mine.has(a.email));
  const direction: "inbound" | "outbound" = fromMe ? "outbound" : "inbound";

  // Counterparty = the side that isn't me.
  const counterparties = (fromMe ? to : from).filter((a) => !mine.has(a.email));
  let contactId: string | null = null;
  let accountId: string | null = null;
  for (const cp of counterparties) {
    contactId = await upsertContact(cp);
    if (!accountId) {
      const { data } = await admin.from("contacts").select("account_id").eq("id", contactId).single();
      accountId = data?.account_id ?? null;
    }
  }

  const attachments = listAttachments(msg.payload as any);
  const rawKey = await storeRaw(gmail, id);

  const row: EmailRow = {
    gmail_message_id: id,
    gmail_thread_id: msg.threadId ?? null,
    contact_id: contactId,
    direction,
    subject: headers.get("subject") ?? null,
    body_text: extractBody(msg.payload as any),
    raw_storage_key: rawKey,
    sent_at: new Date(Number(msg.internalDate ?? Date.now())).toISOString(),
    has_attachments: attachments.length > 0,
  };
  await upsertEmail(row);

  // Best-effort attachment capture; never let it fail the whole message.
  for (const att of attachments) {
    if (SKIP_EXT.test(att.filename)) continue;
    if (SKIP_MIME.test(att.mimeType) && att.size < SKIP_MIN_IMAGE_BYTES) continue;
    try {
      const data = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId: id,
        id: att.attachmentId,
      });
      if (!data.data.data) continue;
      const buf = Buffer.from(data.data.data, "base64url");
      await admin.storage.from(ATTACH_BUCKET).upload(`${id}/${att.filename}`, buf, {
        contentType: att.mimeType,
        upsert: true,
      });
    } catch {
      /* skip a bad attachment, keep the email */
    }
  }
  return accountId;
}

/** Store the raw RFC822 message so body_text is regenerable later. */
async function storeRaw(gmail: Gmail, id: string): Promise<string | null> {
  try {
    const res = await gmail.users.messages.get({ userId: "me", id, format: "raw" });
    if (!res.data.raw) return null;
    const key = `${id}.eml`;
    await admin.storage
      .from(RAW_BUCKET)
      .upload(key, Buffer.from(res.data.raw, "base64url"), {
        contentType: "message/rfc822",
        upsert: true,
      });
    return key;
  } catch {
    return null;
  }
}
