import { admin } from "./supabase";

type Deal = {
  id: string;
  name: string;
  stage: string;
  owner_next_step: string | null;
  last_outbound_at: string;
};

/**
 * Daily nudge: find open deals where you spoke last 7+ days ago, email yourself
 * a digest, and log a `nudge` activity per deal.
 */
export async function runNudge(): Promise<{ count: number; sent: boolean }> {
  const { data, error } = await admin.rpc("deals_needing_nudge");
  if (error) throw error;
  const deals = (data ?? []) as Deal[];
  if (deals.length === 0) return { count: 0, sent: false };

  const sent = await sendDigest(deals);

  // One nudge activity per deal (occurred_at now; not deduped by ref).
  const nowIso = new Date().toISOString();
  await admin.from("activities").insert(
    deals.map((d) => ({
      deal_id: d.id,
      type: "nudge" as const,
      ref_id: null,
      occurred_at: nowIso,
      summary: `No response for 7+ days — needs a touch (${d.stage}).`,
    }))
  );

  return { count: deals.length, sent };
}

async function sendDigest(deals: Deal[]): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.NUDGE_TO;
  const from = process.env.NUDGE_FROM;
  if (!key || !to || !from) return false; // not configured yet → digest is a no-op

  const days = (iso: string) =>
    Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  const lines = deals
    .map((d) => `• ${d.name} — ${days(d.last_outbound_at)}d silent${d.owner_next_step ? ` · next: ${d.owner_next_step}` : ""}`)
    .join("<br>");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      subject: `${deals.length} deal${deals.length > 1 ? "s" : ""} need a touch`,
      html: `<p>These deals have gone quiet 7+ days after your last message:</p><p>${lines}</p>`,
    }),
  });
  return res.ok;
}
