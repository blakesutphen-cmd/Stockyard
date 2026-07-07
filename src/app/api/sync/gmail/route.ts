import { NextRequest, NextResponse } from "next/server";
import { requireSyncSecret } from "@/lib/http";
import { syncGmail } from "@/lib/sync/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // first backfill is slow

export async function POST(req: NextRequest) {
  const denied = requireSyncSecret(req);
  if (denied) return denied;
  try {
    const result = await syncGmail();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
