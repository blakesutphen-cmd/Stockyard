import { admin } from "./supabase";

/** Cached config loaders. Cache lifetime is one warm serverless invocation. */
let _mine: Set<string> | null = null;
let _freemail: Set<string> | null = null;
let _tz: string | null = null;

export async function myAddresses(): Promise<Set<string>> {
  if (_mine) return _mine;
  const { data } = await admin.from("my_addresses").select("email");
  _mine = new Set((data ?? []).map((r) => r.email.toLowerCase()));
  return _mine;
}

export async function freemailDomains(): Promise<Set<string>> {
  if (_freemail) return _freemail;
  const { data } = await admin.from("freemail_domains").select("domain");
  _freemail = new Set((data ?? []).map((r) => r.domain.toLowerCase()));
  return _freemail;
}

export async function appTimezone(): Promise<string> {
  if (_tz) return _tz;
  const { data } = await admin.from("app_settings").select("timezone").single();
  const tz: string = (data?.timezone as string | undefined) ?? "America/Denver";
  _tz = tz;
  return tz;
}

export type MeetingKind = {
  kind: string;
  default_minutes: number | null;
  title_tokens: string[];
};
export async function meetingKinds(): Promise<MeetingKind[]> {
  const { data } = await admin
    .from("meeting_kinds")
    .select("kind, default_minutes, title_tokens");
  return (data ?? []) as MeetingKind[];
}
