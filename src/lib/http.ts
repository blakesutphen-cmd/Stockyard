import { NextRequest, NextResponse } from "next/server";

/**
 * Guard for cron-triggered routes. pg_cron sends `Authorization: Bearer <SYNC_SECRET>`.
 * Returns a 401 response if the secret is missing or wrong, else null.
 */
export function requireSyncSecret(req: NextRequest): NextResponse | null {
  const expected = process.env.SYNC_SECRET;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || got !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
