import Link from "next/link";
import { notFound } from "next/navigation";
import { getDeal, getActivities } from "@/lib/db";
import { updateDeal, snoozeDeal } from "@/lib/actions";
import { STAGES, isClosed, money, fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const ICON: Record<string, string> = {
  email_in: "📥",
  email_out: "📤",
  meeting: "📅",
  note: "📝",
  stage_change: "🔀",
  nudge: "🔔",
  reassign: "↔️",
};

export default async function DealDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deal = await getDeal(id);
  if (!deal) notFound();
  const activities = await getActivities(id);
  const closed = isClosed(deal.stage);

  return (
    <main>
      <p style={{ marginBottom: 4 }}>
        <Link href="/deals" style={{ color: "#0a5", textDecoration: "none" }}>
          ← Deals
        </Link>
      </p>
      <h1 style={{ marginTop: 0 }}>{deal.name}</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        {deal.accounts?.name || deal.accounts?.domain} · updated {fmtDate(deal.updated_at)}
      </p>

      <section style={card}>
        <form action={updateDeal} style={{ display: "grid", gap: 12, maxWidth: 520 }}>
          <input type="hidden" name="id" value={deal.id} />
          <Field label="Stage">
            <select name="stage" defaultValue={deal.stage} style={inp}>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Value">
            <input name="value" type="number" defaultValue={deal.value ?? ""} placeholder="—" style={inp} />
          </Field>
          <Field label="Next step">
            <textarea
              name="owner_next_step"
              defaultValue={deal.owner_next_step ?? ""}
              rows={2}
              placeholder="What do YOU owe this deal?"
              style={{ ...inp, resize: "vertical" }}
            />
          </Field>
          <Field label="Closed reason">
            <input
              name="closed_reason"
              defaultValue={deal.closed_reason ?? ""}
              placeholder="only used when stage is closed_won / closed_lost"
              style={inp}
            />
          </Field>
          <div>
            <button style={btn}>Save</button>
            <span style={{ marginLeft: 12, color: "#888", fontSize: 13 }}>
              Value {money(deal.value)}
              {closed && deal.closed_at ? ` · closed ${fmtDate(deal.closed_at)}` : ""}
            </span>
          </div>
        </form>

        {!closed && (
          <form action={snoozeDeal} style={{ marginTop: 12 }}>
            <input type="hidden" name="deal_id" value={deal.id} />
            <input type="hidden" name="days" value="7" />
            <button style={btnGhost}>Snooze nudge 7d</button>
            {deal.nudge_snoozed_until && (
              <span style={{ marginLeft: 10, color: "#888", fontSize: 13 }}>
                snoozed until {fmtDate(deal.nudge_snoozed_until)}
              </span>
            )}
          </form>
        )}
      </section>

      <h2 style={{ fontSize: 16 }}>Timeline</h2>
      {activities.length === 0 ? (
        <p style={{ color: "#888" }}>No activity yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {activities.map((a) => (
            <li key={a.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: "1px solid #eee" }}>
              <span aria-hidden>{ICON[a.type] ?? "•"}</span>
              <span style={{ color: "#888", fontSize: 13, minWidth: 120 }}>{fmtDate(a.occurred_at)}</span>
              <span>{a.summary || a.type}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={{ fontSize: 13, color: "#666" }}>{label}</span>
      {children}
    </label>
  );
}

const card: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: 10,
  padding: 16,
  marginBottom: 28,
};
const inp: React.CSSProperties = { padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6, font: "inherit" };
const btn: React.CSSProperties = {
  ...inp,
  background: "#0a5",
  color: "white",
  border: "none",
  cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  ...inp,
  background: "white",
  color: "#333",
  cursor: "pointer",
};
