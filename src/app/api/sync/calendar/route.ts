import { NextRequest, NextResponse } from "next/server";
import { requireSyncSecret } from "@/lib/http";
import { syncCalendar } from "@/lib/sync/calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const denied = requireSyncSecret(req);
  if (denied) return denied;
  try {
    const result = await syncCalendar();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
