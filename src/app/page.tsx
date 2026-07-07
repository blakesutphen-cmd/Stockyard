import Link from "next/link";
import {
  dashboardMeetingsThisWeek,
  dashboardPipeline,
  dealsNeedingNudge,
  triageCount,
  isConnected,
} from "@/lib/db";
import { snoozeDeal, markResponded } from "@/lib/actions";
import { money, daysAgo, STAGES, isClosed } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const [connected, week, pipeline, nudges, triage] = await Promise.all([
    isConnected(),
    dashboardMeetingsThisWeek(),
    dashboardPipeline(),
    dealsNeedingNudge(),
    triageCount(),
  ]);

  const open = pipeline.filter((p) => !p.closed);
  const closedQ = pipeline.filter((p) => p.closed);
  const openStages = STAGES.filter((s) => !isClosed(s));
  const pipelineValue = open.reduce((sum, p) => sum + Number(p.total_value || 0), 0);

  return (
    <main>
      <h1>Dashboard</h1>

      {!connected && (
        <div style={banner}>
          Google isn’t connected — sync is idle.{" "}
          <a href="/api/auth/google" style={{ color: "#0a5" }}>
            Connect Gmail + Calendar →
          </a>
        </div>
      )}

      {/* This week's meetings by kind */}
      <h2 style={h2}>This week’s meetings</h2>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {week.length === 0 ? (
          <p style={muted}>No meeting kinds configured.</p>
        ) : (
          week.map((w) => (
            <div key={w.kind} style={cardStat}>
              <div style={{ fontSize: 28, fontWeight: 600 }}>{w.cnt}</div>
              <div style={{ color: "#666", fontSize: 13 }}>{w.label}</div>
            </div>
          ))
        )}
      </div>

      {/* Pipeline */}
      <h2 style={h2}>
        Pipeline <span style={{ color: "#888", fontWeight: 400 }}>· {money(pipelineValue)} open</span>
      </h2>
      <table style={table}>
        <thead>
          <tr style={thead}>
            <th style={th}>Stage</th>
            <th style={th}>Deals</th>
            <th style={th}>Value</th>
          </tr>
        </thead>
        <tbody>
          {openStages.map((s) => {
            const row = open.find((p) => p.stage === s);
            return (
              <tr key={s} style={tr}>
                <td style={td}>{s}</td>
                <td style={td}>{row?.deal_count ?? 0}</td>
                <td style={td}>{money(row ? Number(row.total_value) : 0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p style={{ ...muted, marginTop: 8 }}>
        This quarter — Won: {stat(closedQ, "closed_won")} · Lost: {stat(closedQ, "closed_lost")}
      </p>

      {/* Needs attention */}
      <h2 style={h2}>Needs attention ({nudges.length})</h2>
      {nudges.length === 0 ? (
        <p style={muted}>Nobody’s waiting on you. 🎉</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {nudges.map((d) => (
            <li key={d.id} style={nudgeRow}>
              <div style={{ flex: 1 }}>
                <Link href={`/deals/${d.id}`} style={{ color: "#0a5", textDecoration: "none" }}>
                  <strong>{d.name}</strong>
                </Link>{" "}
                <span style={{ color: "#888", fontSize: 13 }}>
                  · {d.stage} · you spoke last {daysAgo(d.last_outbound_at)}
                </span>
                {d.owner_next_step && (
                  <div style={{ color: "#666", fontSize: 13 }}>next: {d.owner_next_step}</div>
                )}
              </div>
              <form action={markResponded}>
                <input type="hidden" name="deal_id" value={d.id} />
                <button style={btnGhost}>Mark responded</button>
              </form>
              <form action={snoozeDeal}>
                <input type="hidden" name="deal_id" value={d.id} />
                <input type="hidden" name="days" value="7" />
                <button style={btnGhost}>Snooze 7d</button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {/* Triage summary */}
      <h2 style={h2}>Triage</h2>
      {triage === 0 ? (
        <p style={muted}>Queue is empty — pipeline is clean.</p>
      ) : (
        <p>
          <Link href="/triage" style={{ color: "#0a5" }}>
            {triage} unassigned item{triage === 1 ? "" : "s"} need a deal →
          </Link>
        </p>
      )}
    </main>
  );
}

function stat(rows: { stage: string; deal_count: number; total_value: number }[], stage: string) {
  const r = rows.find((x) => x.stage === stage);
  return `${r?.deal_count ?? 0} · ${money(r ? Number(r.total_value) : 0)}`;
}

const banner: React.CSSProperties = {
  background: "#fff7e6",
  border: "1px solid #ffd591",
  borderRadius: 8,
  padding: "10px 14px",
  marginBottom: 20,
};
const h2: React.CSSProperties = { fontSize: 16, marginTop: 32 };
const muted: React.CSSProperties = { color: "#888" };
const cardStat: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: 10,
  padding: "14px 18px",
  minWidth: 120,
};
const table: React.CSSProperties = { borderCollapse: "collapse", width: "100%", maxWidth: 480 };
const thead: React.CSSProperties = { textAlign: "left", color: "#666", fontSize: 13 };
const th: React.CSSProperties = { padding: "6px 8px", fontWeight: 500 };
const tr: React.CSSProperties = { borderTop: "1px solid #eee" };
const td: React.CSSProperties = { padding: "8px" };
const nudgeRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  padding: "10px 0",
  borderTop: "1px solid #eee",
};
const btnGhost: React.CSSProperties = {
  padding: "6px 8px",
  border: "1px solid #ccc",
  borderRadius: 6,
  background: "white",
  cursor: "pointer",
  fontSize: 13,
};
