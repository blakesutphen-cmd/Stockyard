import type { MeetingKind } from "../config";

export type Addr = { email: string; name: string | null };

/** Parse a header value like `"Jane Doe" <jane@obvio.ai>, bob@x.com` into addresses. */
export function parseAddresses(header: string | undefined): Addr[] {
  if (!header) return [];
  return header
    .split(",")
    .map((raw) => {
      const m = raw.match(/<([^>]+)>/);
      const email = (m ? m[1] : raw).trim().toLowerCase();
      let name: string | null = m ? raw.slice(0, m.index).trim() : null;
      if (name) name = name.replace(/^["']|["']$/g, "").trim() || null;
      return email ? { email, name } : null;
    })
    .filter((a): a is Addr => !!a && /.+@.+\..+/.test(a.email));
}

export function domainOf(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1).toLowerCase();
}

/** Gmail uses base64url, sometimes unpadded. */
export function decodeB64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

type GmailPart = {
  mimeType?: string;
  body?: { data?: string; attachmentId?: string; size?: number };
  filename?: string;
  parts?: GmailPart[];
};

/** Depth-first search for the best text body: prefer text/plain, fall back to html→text. */
export function extractBody(payload: GmailPart | undefined): string {
  if (!payload) return "";
  let plain = "";
  let html = "";
  const walk = (p: GmailPart) => {
    if (p.mimeType === "text/plain" && p.body?.data && !plain) plain = decodeB64Url(p.body.data);
    else if (p.mimeType === "text/html" && p.body?.data && !html) html = decodeB64Url(p.body.data);
    p.parts?.forEach(walk);
  };
  walk(payload);
  const raw = plain || htmlToText(html);
  return stripQuotedReply(raw);
}

/** List attachment parts (id + filename + size + mime) for a payload. */
export function listAttachments(payload: GmailPart | undefined) {
  const out: { attachmentId: string; filename: string; size: number; mimeType: string }[] = [];
  const walk = (p: GmailPart) => {
    if (p.filename && p.body?.attachmentId) {
      out.push({
        attachmentId: p.body.attachmentId,
        filename: p.filename,
        size: p.body.size ?? 0,
        mimeType: p.mimeType ?? "application/octet-stream",
      });
    }
    p.parts?.forEach(walk);
  };
  if (payload) walk(payload);
  return out;
}

function htmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Strip quoted replies and signatures so body_text is just the new content.
 * V1 heuristic — swap for `email-reply-parser`/`talon` later; raw .eml is kept
 * in Storage so body_text can be regenerated without re-syncing Gmail.
 */
export function stripQuotedReply(text: string): string {
  if (!text) return "";
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  const cutMarkers = [
    /^On .+ wrote:$/i,               // "On Mon, ... <x@y> wrote:"
    /^-{2,}\s*Original Message\s*-{2,}/i,
    /^_{5,}$/,                        // Outlook divider
    /^From:\s.+/i,                   // forwarded/quoted header block
    /^Sent from my /i,
  ];
  for (const line of lines) {
    if (cutMarkers.some((re) => re.test(line.trim()))) break;
    if (line.trim() === "--") break;  // signature delimiter
    if (line.startsWith(">")) continue;
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Classify a calendar title to a meeting_kind using the config table's tokens. */
export function classifyMeetingKind(title: string | undefined, kinds: MeetingKind[]): string {
  const t = (title ?? "").toLowerCase();
  for (const k of kinds) {
    if (k.title_tokens.some((tok) => tok && t.includes(tok.toLowerCase()))) return k.kind;
  }
  return "other";
}
