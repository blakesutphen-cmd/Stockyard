import { NextRequest, NextResponse } from "next/server";
import { storeCodeTokens } from "@/lib/google/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const err = req.nextUrl.searchParams.get("error");
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  if (!code) return NextResponse.json({ error: "missing code" }, { status: 400 });

  try {
    await storeCodeTokens(code);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
  return NextResponse.redirect(new URL("/?connected=1", req.url));
}
