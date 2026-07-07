export const dynamic = "force-dynamic";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  return (
    <main style={{ maxWidth: 320, margin: "80px auto" }}>
      <h1 style={{ fontSize: 20 }}>Stockyard</h1>
      <form action="/api/login" method="post" style={{ display: "grid", gap: 10 }}>
        <input type="hidden" name="next" value={next ?? "/"} />
        <input
          name="passcode"
          type="password"
          placeholder="Passcode"
          autoFocus
          required
          style={{ padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6 }}
        />
        <button
          style={{
            padding: "8px 10px",
            background: "#0a5",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          Enter
        </button>
        {error && <p style={{ color: "#c00", fontSize: 13, margin: 0 }}>Wrong passcode.</p>}
      </form>
    </main>
  );
}
