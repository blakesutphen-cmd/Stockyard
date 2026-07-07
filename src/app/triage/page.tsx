import { triageEmails, triageMeetings, listOpenDeals, type OpenDeal } from "@/lib/db";
import { assignEmail, assignMeeting } from "@/lib/actions";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TriagePage() {
  const [emails, meetings, deals] = await Promise.all([
    triageEmails(),
    triageMeetings(),
    listOpenDeals(),
  ]);

  return (
    <main>
      <h1>Triage</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Unassigned items — usually because the account has zero or multiple open deals. Keep this at
        zero and everything downstream stays clean.
      </p>

      <h2 style={{ fontSize: 16 }}>Emails ({emails.length})</h2>
      {emails.length === 0 ? (
        <p style={{ color: "#888" }}>Nothing to triage. 🎉</p>
      ) : (
        <ul style={list}>
          {emails.map((e) => (
            <li key={e.id} style={row}>
              <div style={{ flex: 1 }}>
                <div>
                  <span style={badge}>{e.direction === "outbound" ? "OUT" : "IN"}</span>{" "}
                  <strong>{e.subject || "(no subject)"}</strong>
                </div>
                <div style={{ color: "#888", fontSize: 13 }}>
                  {e.contacts?.name || e.contacts?.email || "unknown"} · {fmtDate(e.sent_at)}
                </div>
              </div>
              <AssignForm action={assignEmail} idField="email_id" idValue={e.id} deals={deals} />
            </li>
          ))}
        </ul>
      )}

      <h2 style={{ fontSize: 16, marginTop: 32 }}>Meetings ({meetings.length})</h2>
      {meetings.length === 0 ? (
        <p style={{ color: "#888" }}>Nothing to triage.</p>
      ) : (
        <ul style={list}>
          {meetings.map((m) => (
            <li key={m.id} style={row}>
              <div style={{ flex: 1 }}>
                <div>
                  <span style={badge}>{m.meeting_kind}</span> <strong>{m.title || "(untitled)"}</strong>
                </div>
                <div style={{ color: "#888", fontSize: 13 }}>
                  {fmtDate(m.starts_at)} · {m.attendee_emails.join(", ") || "no attendees"}
                </div>
              </div>
              <AssignForm action={assignMeeting} idField="meeting_id" idValue={m.id} deals={deals} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function AssignForm({
  action,
  idField,
  idValue,
  deals,
}: {
  action: (fd: FormData) => Promise<void>;
  idField: string;
  idValue: string;
  deals: OpenDeal[];
}) {
  if (deals.length === 0) {
    return <span style={{ color: "#c00", fontSize: 13 }}>Create a deal first</span>;
  }
  return (
    <form action={action} style={{ display: "flex", gap: 6 }}>
      <input type="hidden" name={idField} value={idValue} />
      <select name="deal_id" required style={inp}>
        <option value="">Assign to…</option>
        {deals.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name} ({d.accounts?.name || d.accounts?.domain})
          </option>
        ))}
      </select>
      <button style={btn}>Assign</button>
    </form>
  );
}

const list: React.CSSProperties = { listStyle: "none", padding: 0 };
const row: React.CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "center",
  padding: "10px 0",
  borderTop: "1px solid #eee",
};
const badge: React.CSSProperties = {
  fontSize: 11,
  background: "#eef",
  color: "#446",
  padding: "1px 6px",
  borderRadius: 4,
};
const inp: React.CSSProperties = { padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6 };
const btn: React.CSSProperties = { ...inp, background: "#0a5", color: "white", border: "none", cursor: "pointer" };
