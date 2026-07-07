import { google, calendar_v3 } from "googleapis";
import { authedClient } from "../google/auth";
import { admin } from "../supabase";
import { meetingKinds, myAddresses } from "../config";
import { classifyMeetingKind } from "./parse";
import {
  upsertMeeting,
  resolveAccounts,
  readCursor,
  writeCursor,
  flagFullSync,
  type MeetingRow,
} from "./store";

type Cal = calendar_v3.Calendar;

export async function syncCalendar(): Promise<{ processed: number; mode: string }> {
  const auth = await authedClient();
  const cal = google.calendar({ version: "v3", auth });
  const { cursor, needsFull } = await readCursor("gcal");
  const kinds = await meetingKinds();
  const mine = await myAddresses();

  const events: calendar_v3.Schema$Event[] = [];
  let nextSyncToken: string | null | undefined;
  let mode = needsFull || !cursor ? "full" : "incremental";

  try {
    let pageToken: string | undefined;
    do {
      const res: any = await cal.events.list({
        calendarId: "primary",
        singleEvents: true,
        showDeleted: true,
        maxResults: 250,
        pageToken,
        ...(mode === "incremental"
          ? { syncToken: cursor! }
          : { timeMin: new Date(Date.now() - 180 * 864e5).toISOString() }),
      });
      (res.data.items ?? []).forEach((e: calendar_v3.Schema$Event) => events.push(e));
      pageToken = res.data.nextPageToken ?? undefined;
      nextSyncToken = res.data.nextSyncToken ?? nextSyncToken;
    } while (pageToken);
  } catch (e: any) {
    if (e?.code === 410) {
      await flagFullSync("gcal", "syncToken expired (410); full re-sync queued");
      return { processed: 0, mode: "reset-to-full" };
    }
    throw e;
  }

  const touchedAccounts = new Set<string>();
  for (const ev of events) {
    if (!ev.id) continue;
    const attendees = (ev.attendees ?? [])
      .map((a) => a.email?.toLowerCase())
      .filter((e): e is string => !!e);

    const row: MeetingRow = {
      gcal_event_id: ev.id,
      meeting_kind: classifyMeetingKind(ev.summary ?? undefined, kinds),
      title: ev.summary ?? null,
      starts_at: ev.start?.dateTime ?? ev.start?.date ?? null,
      ends_at: ev.end?.dateTime ?? ev.end?.date ?? null,
      attendee_emails: attendees,
      status: ev.status === "cancelled" ? "cancelled" : "confirmed",
    };
    await upsertMeeting(row);

    // Resolve accounts from external attendees.
    const external = attendees.filter((a) => !mine.has(a));
    if (external.length) {
      const { data } = await admin
        .from("contacts")
        .select("account_id")
        .in("email", external);
      (data ?? []).forEach((c) => c.account_id && touchedAccounts.add(c.account_id));
    }
  }

  await resolveAccounts(touchedAccounts);
  await writeCursor("gcal", nextSyncToken ?? cursor, { needsFull: false });
  return { processed: events.length, mode };
}
