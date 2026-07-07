import { listContacts } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const contacts = await listContacts();
  return (
    <main>
      <h1>Contacts ({contacts.length})</h1>
      <p style={{ color: "#666", marginTop: 0 }}>Auto-created by sync from email headers / attendees.</p>
      {contacts.length === 0 ? (
        <p style={{ color: "#888" }}>None yet.</p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#666", fontSize: 13 }}>
              <th style={th}>Email</th>
              <th style={th}>Name</th>
              <th style={th}>Title</th>
              <th style={th}>Account</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id} style={{ borderTop: "1px solid #eee" }}>
                <td style={td}>{c.email}</td>
                <td style={td}>{c.name || "—"}</td>
                <td style={td}>{c.title || "—"}</td>
                <td style={td}>{c.accounts?.domain || "—"}</td>
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
