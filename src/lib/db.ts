import { admin } from "./supabase";

// Shapes we select. Supabase's client is untyped, so we cast the results.
export type AccountRef = { name: string | null; domain: string } | null;

export type DealRow = {
  id: string;
  name: string;
  stage: string;
  value: number | null;
  owner_next_step: string | null;
  last_outbound_at: string | null;
  last_inbound_at: string | null;
  nudge_snoozed_until: string | null;
  closed_at: string | null;
  closed_reason: string | null;
  updated_at: string;
  accounts: AccountRef;
};

export type ActivityRow = {
  id: string;
  type: string;
  occurred_at: string;
  summary: string | null;
  ref_id: string | null;
};

export type TriageEmail = {
  id: string;
  subject: string | null;
  sent_at: string;
  direction: string;
  contacts: { email: string; name: string | null; account_id: string | null } | null;
};

export type TriageMeeting = {
  id: string;
  title: string | null;
  starts_at: string | null;
  meeting_kind: string;
  attendee_emails: string[];
};

export type OpenDeal = { id: string; name: string; accounts: AccountRef };

const DEAL_COLS =
  "id,name,stage,value,owner_next_step,last_outbound_at,last_inbound_at," +
  "nudge_snoozed_until,closed_at,closed_reason,updated_at,accounts(name,domain)";

export async function listDeals(): Promise<DealRow[]> {
  const { data } = await admin.from("deals").select(DEAL_COLS).order("updated_at", { ascending: false });
  return (data ?? []) as unknown as DealRow[];
}

export async function getDeal(id: string): Promise<DealRow | null> {
  const { data } = await admin.from("deals").select(DEAL_COLS).eq("id", id).maybeSingle();
  return (data as unknown as DealRow) ?? null;
}

export async function getActivities(dealId: string): Promise<ActivityRow[]> {
  const { data } = await admin
    .from("activities")
    .select("id,type,occurred_at,summary,ref_id")
    .eq("deal_id", dealId)
    .order("occurred_at", { ascending: false })
    .limit(200);
  return (data ?? []) as unknown as ActivityRow[];
}

/** Open deals for assignment dropdowns. */
export async function listOpenDeals(): Promise<OpenDeal[]> {
  const { data } = await admin
    .from("deals")
    .select("id,name,accounts(name,domain)")
    .not("stage", "in", "(closed_won,closed_lost)")
    .order("updated_at", { ascending: false });
  return (data ?? []) as unknown as OpenDeal[];
}

export async function triageEmails(): Promise<TriageEmail[]> {
  const { data } = await admin
    .from("emails")
    .select("id,subject,sent_at,direction,contacts(email,name,account_id)")
    .is("deal_id", null)
    .order("sent_at", { ascending: false })
    .limit(200);
  return (data ?? []) as unknown as TriageEmail[];
}

export async function triageMeetings(): Promise<TriageMeeting[]> {
  const { data } = await admin
    .from("meetings")
    .select("id,title,starts_at,meeting_kind,attendee_emails")
    .is("deal_id", null)
    .eq("status", "confirmed")
    .order("starts_at", { ascending: false })
    .limit(200);
  return (data ?? []) as unknown as TriageMeeting[];
}

export async function triageCount(): Promise<number> {
  const [e, m] = await Promise.all([
    admin.from("emails").select("id", { count: "exact", head: true }).is("deal_id", null),
    admin
      .from("meetings")
      .select("id", { count: "exact", head: true })
      .is("deal_id", null)
      .eq("status", "confirmed"),
  ]);
  return (e.count ?? 0) + (m.count ?? 0);
}

export type AccountListRow = { id: string; name: string | null; domain: string; tags: string[] };
export async function listAccounts(): Promise<AccountListRow[]> {
  const { data } = await admin.from("accounts").select("id,name,domain,tags").order("domain");
  return (data ?? []) as unknown as AccountListRow[];
}

// ---- Dashboard aggregates ----
export type WeekMeetingStat = { kind: string; label: string; cnt: number };
export async function dashboardMeetingsThisWeek(): Promise<WeekMeetingStat[]> {
  const { data } = await admin.rpc("dashboard_meetings_this_week");
  return (data ?? []) as unknown as WeekMeetingStat[];
}

export type PipelineRow = {
  stage: string;
  deal_count: number;
  total_value: number;
  closed: boolean;
};
export async function dashboardPipeline(): Promise<PipelineRow[]> {
  const { data } = await admin.rpc("dashboard_pipeline");
  return (data ?? []) as unknown as PipelineRow[];
}

export type NudgeDeal = {
  id: string;
  name: string;
  stage: string;
  owner_next_step: string | null;
  last_outbound_at: string | null;
};
export async function dealsNeedingNudge(): Promise<NudgeDeal[]> {
  const { data } = await admin.rpc("deals_needing_nudge");
  return (data ?? []) as unknown as NudgeDeal[];
}

export async function isConnected(): Promise<boolean> {
  try {
    const { data } = await admin.from("google_oauth").select("id").maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

export type ContactListRow = {
  id: string;
  email: string;
  name: string | null;
  title: string | null;
  accounts: { domain: string } | null;
};
export async function listContacts(): Promise<ContactListRow[]> {
  const { data } = await admin
    .from("contacts")
    .select("id,email,name,title,accounts(domain)")
    .order("email");
  return (data ?? []) as unknown as ContactListRow[];
}
