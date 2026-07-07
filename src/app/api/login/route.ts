import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Only allow same-origin relative redirect targets (no open redirect).
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const passcode = String(form.get("passcode") ?? "");
  const next = safeNext(String(form.get("next") ?? "/"));
  const expected = process.env.APP_PASSCODE;
  const token = process.env.AUTH_TOKEN;

  if (!expected || !token || passcode !== expected) {
    return NextResponse.redirect(new URL("/login?error=1", req.url), { status: 303 });
  }

  const res = NextResponse.redirect(new URL(next, req.url), { status: 303 });
  res.cookies.set("stockyard_auth", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
