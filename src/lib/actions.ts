"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { admin } from "./supabase";
import { isClosed } from "./format";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
function numOrNull(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  return v === "" ? null : Number(v);
}

/** Create a deal. Firing the DB trigger sweeps this account's triage items. */
export async function createDeal(fd: FormData): Promise<void> {
  const account_id = str(fd, "account_id");
  const name = str(fd, "name");
  if (!account_id || !name) throw new Error("account and name are required");
  const { data, error } = await admin
    .from("deals")
    .insert({
      account_id,
      name,
      stage: str(fd, "stage") || "discovery",
      value: numOrNull(fd, "value"),
    })
    .select("id")
    .single();
  if (error) throw error;
  revalidatePath("/deals");
  revalidatePath("/triage");
  redirect(`/deals/${data.id}`);
}

/** Update a deal header. Logs a stage_change activity and stamps closed_at. */
export async function updateDeal(fd: FormData): Promise<void> {
  const id = str(fd, "id");
  const stage = str(fd, "stage");
  if (!id || !stage) throw new Error("id and stage are required");

  const { data: cur } = await admin.from("deals").select("stage, closed_at").eq("id", id).single();
  const patch: Record<string, unknown> = {
    stage,
    value: numOrNull(fd, "value"),
    owner_next_step: str(fd, "owner_next_step") || null,
  };
  if (isClosed(stage)) {
    patch.closed_reason = str(fd, "closed_reason") || null;
    if (!cur?.closed_at) patch.closed_at = new Date().toISOString();
  } else {
    patch.closed_at = null;
    patch.closed_reason = null;
  }

  const { error } = await admin.from("deals").update(patch).eq("id", id);
  if (error) throw error;

  if (cur && cur.stage !== stage) {
    await admin.from("activities").insert({
      deal_id: id,
      type: "stage_change",
      ref_id: null,
      occurred_at: new Date().toISOString(),
      summary: `Stage: ${cur.stage} → ${stage}`,
    });
  }
  revalidatePath(`/deals/${id}`);
  revalidatePath("/deals");
}

/** Assign an unassigned email to a deal (triggers recompute + activity). */
export async function assignEmail(fd: FormData): Promise<void> {
  const email_id = str(fd, "email_id");
  const deal_id = str(fd, "deal_id");
  if (!email_id || !deal_id) throw new Error("email and deal are required");
  const { error } = await admin.from("emails").update({ deal_id }).eq("id", email_id);
  if (error) throw error;
  revalidatePath("/triage");
  revalidatePath(`/deals/${deal_id}`);
}

/** Assign an unassigned meeting to a deal. */
export async function assignMeeting(fd: FormData): Promise<void> {
  const meeting_id = str(fd, "meeting_id");
  const deal_id = str(fd, "deal_id");
  if (!meeting_id || !deal_id) throw new Error("meeting and deal are required");
  const { error } = await admin.from("meetings").update({ deal_id }).eq("id", meeting_id);
  if (error) throw error;
  revalidatePath("/triage");
  revalidatePath(`/deals/${deal_id}`);
}

/**
 * Mark a nudged deal as responded: stamp last_inbound_at = now so the nudge
 * condition (last_outbound > last_inbound) goes false. A later real inbound
 * email recomputes this from the emails table.
 */
export async function markResponded(fd: FormData): Promise<void> {
  const deal_id = str(fd, "deal_id");
  if (!deal_id) throw new Error("deal is required");
  const { error } = await admin
    .from("deals")
    .update({ last_inbound_at: new Date().toISOString() })
    .eq("id", deal_id);
  if (error) throw error;
  revalidatePath("/");
  revalidatePath(`/deals/${deal_id}`);
}

/** Snooze a deal's nudge by N days (default 7). */
export async function snoozeDeal(fd: FormData): Promise<void> {
  const deal_id = str(fd, "deal_id");
  const days = Number(str(fd, "days") || "7");
  const until = new Date(Date.now() + days * 864e5).toISOString();
  const { error } = await admin.from("deals").update({ nudge_snoozed_until: until }).eq("id", deal_id);
  if (error) throw error;
  revalidatePath(`/deals/${deal_id}`);
  revalidatePath("/deals");
  revalidatePath("/");
}
