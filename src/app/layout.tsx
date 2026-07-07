import Link from "next/link";
import { cookies } from "next/headers";
import { triageCount } from "@/lib/db";

export const metadata = { title: "Stockyard CRM" };
export const dynamic = "force-dynamic";

async function Nav() {
  let count = 0;
  try {
    count = await triageCount();
  } catch {
    /* DB not configured yet — nav still renders */
  }
  const links: [string, string][] = [
    ["/", "Home"],
    ["/deals", "Deals"],
    ["/triage", count ? `Triage (${count})` : "Triage"],
    ["/accounts", "Accounts"],
    ["/contacts", "Contacts"],
  ];
  return (
    <nav
      style={{
        display: "flex",
        gap: 16,
        alignItems: "center",
        borderBottom: "1px solid #e5e5e5",
        paddingBottom: 12,
        marginBottom: 24,
      }}
    >
      <strong style={{ marginRight: 8 }}>Stockyard</strong>
      {links.map(([href, label]) => (
        <Link key={href} href={href} style={{ color: "#0a5", textDecoration: "none" }}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const authed =
    (await cookies()).get("stockyard_auth")?.value === process.env.AUTH_TOKEN &&
    !!process.env.AUTH_TOKEN;
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          margin: 0,
          padding: 32,
          maxWidth: 960,
          color: "#1a1a1a",
        }}
      >
        {authed && <Nav />}
        {children}
      </body>
    </html>
  );
}
