import Link from "next/link";
import { listDeals, listAccounts } from "@/lib/db";
import { createDeal } from "@/lib/actions";
import { money, daysAgo, STAGES, isClosed } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DealsPage() {
  const [deals, accounts] = await Promise.all([listDeals(), listAccounts()]);
  const open = deals.filter((d) => !isClosed(d.stage));
  const closed = deals.filter((d) => isClosed(d.stage));

  return (
    <main>
      <h1>Deals</h1>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16 }}>New deal</h2>
        {accounts.length === 0 ? (
          <p style={{ color: "#888" }}>
            No accounts yet — they’re auto-created by sync, or add one, then create a deal.
          </p>
        ) : (
          <form action={createDeal} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select name="account_id" required style={inp}>
              <option value="">Account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.domain}
                </option>
              ))}
            </select>
            <input name="name" placeholder="Deal name" required style={{ ...inp, minWidth: 260 }} />
            <select name="stage" defaultValue="discovery" style={inp}>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input name="value" placeholder="Value ($)" type="number" style={{ ...inp, width: 120 }} />
            <button style={btn}>Create</button>
          </form>
        )}
      </section>

      <DealTable title={`Open (${open.length})`} rows={open} />
      {closed.length > 0 && <DealTable title={`Closed (${closed.length})`} rows={closed} />}
    </main>
  );
}

function DealTable({ title, rows }: { title: string; rows: Awaited<ReturnType<typeof listDeals>> }) {
  if (rows.length === 0) return <p style={{ color: "#888" }}>No {title.toLowerCase()} deals.</p>;
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 16 }}>{title}</h2>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#666", fontSize: 13 }}>
            <th style={th}>Deal</th>
            <th style={th}>Account</th>
            <th style={th}>Stage</th>
            <th style={th}>Value</th>
            <th style={th}>Last out</th>
            <th style={th}>Last in</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id} style={{ borderTop: "1px solid #eee" }}>
              <td style={td}>
                <Link href={`/deals/${d.id}`} style={{ color: "#0a5", textDecoration: "none" }}>
                  {d.name}
                </Link>
              </td>
              <td style={td}>{d.accounts?.name || d.accounts?.domain || "—"}</td>
              <td style={td}>{d.stage}</td>
              <td style={td}>{money(d.value)}</td>
              <td style={td}>{daysAgo(d.last_outbound_at)}</td>
              <td style={td}>{daysAgo(d.last_inbound_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const inp: React.CSSProperties = { padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6 };
const btn: React.CSSProperties = { ...inp, background: "#0a5", color: "white", border: "none", cursor: "pointer" };
const th: React.CSSProperties = { padding: "6px 8px", fontWeight: 500 };
const td: React.CSSProperties = { padding: "8px" };
