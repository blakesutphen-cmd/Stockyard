import { listAccounts } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const accounts = await listAccounts();
  return (
    <main>
      <h1>Accounts ({accounts.length})</h1>
      <p style={{ color: "#666", marginTop: 0 }}>Auto-created by sync from email/calendar domains.</p>
      {accounts.length === 0 ? (
        <p style={{ color: "#888" }}>None yet.</p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#666", fontSize: 13 }}>
              <th style={th}>Domain</th>
              <th style={th}>Name</th>
              <th style={th}>Tags</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} style={{ borderTop: "1px solid #eee" }}>
                <td style={td}>{a.domain}</td>
                <td style={td}>{a.name || "—"}</td>
                <td style={td}>{a.tags?.length ? a.tags.join(", ") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

const th: React.CSSProperties = { padding: "6px 8px", fontWeight: 500 };
const td: React.CSSProperties = { padding: "8px" };
